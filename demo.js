// Import required modules
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const admin = require("firebase-admin");

// Firebase initialization
const serviceAccount = require("./config/serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log(" Connected to MongoDB"))
  .catch((err) => console.error(" MongoDB Connection Error:", err));

const app = express();
app.use(express.json());
app.use(cors());

// Middleware: Check Authentication
const checkAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const userData = await admin.auth().verifyIdToken(token);
    req.user = userData;
    next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

// Define User Schema & Model
const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      firebase_uid: { type: String, required: true, unique: true },
      full_name: String,
      email: { type: String, unique: true },
      role: { type: String, enum: ["student", "professor", "admin"], default: "student" },
      university: String,
      research_interests: [String],
      citations: { type: Number },
    },
    { timestamps: true }
  )
);

// Define Research Schema & Model
const Research = mongoose.model(
  "Research",
  new mongoose.Schema(
    {
      title: String,
      description: String,
      professor_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      university: String,
      eligibility: { degree: String, year: [String], skills_required: [String] },
      status: { type: String, enum: ["open", "closed"], default: "open" },
      applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    { timestamps: true }
  )
);

// Define APIs

// User login (creates account if not exists)
app.post("/api/auth/login", checkAuth, async (req, res) => {
  const { email, name, uid } = req.user;
  let user = await User.findOne({ email });

  if (!user) {
    user = new User({ firebase_uid: uid, full_name: name, email });
    await user.save();
  }

  res.json({ message: "Login successful", user });
});

// **Students can see only professors**
app.get("/api/users/professors", checkAuth, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const professors = await User.find({ role: "professor" }).select("-firebase_uid");
    res.json(professors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching professors", error });
  }
});

// **Professors can see only students**
app.get("/api/users/students", checkAuth, async (req, res) => {
  if (req.user.role !== "professor") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const students = await User.find({ role: "student" }).select("-firebase_uid");
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: "Error fetching students", error });
  }
});

// **Admins can see all users**
app.get("/api/users", checkAuth, async (req, res) => {
  try {
    let users;

    if (req.user.role === "student") {
      users = await User.find({ role: "professor" }).select("-firebase_uid");
    } else if (req.user.role === "professor") {
      users = await User.find({ role: "student" }).select("-firebase_uid");
    } else if (req.user.role === "admin") {
      users = await User.find().select("-firebase_uid");
    }

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users", error });
  }
});

// Professors can post research
app.post("/api/research", checkAuth, async (req, res) => {
  if (req.user.role !== "professor") {
    return res.status(403).json({ message: "Only professors can post research" });
  }

  const research = new Research(req.body);
  await research.save();
  res.status(201).json(research);
});

// Get all research listings
app.get("/api/research", async (req, res) => {
  const researchList = await Research.find().populate("professor_id", "full_name email");
  res.json(researchList);
});

// Students can apply to research
app.post("/api/apply", checkAuth, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Only students can apply" });
  }

  const application = new Application({
    student_id: req.user.uid,
    research_id: req.body.research_id,
    application_text: req.body.application_text,
  });

  await application.save();
  res.status(201).json({ message: "Application submitted", application });
});

// Get all discussions
app.get("/api/discussions", async (req, res) => {
  const discussions = await Discussion.find().populate("created_by", "full_name email");
  res.json(discussions);
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
