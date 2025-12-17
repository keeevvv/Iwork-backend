import express from "express";
import { register, login } from "../controller/userController.js";
import { createJob, getAllJobs } from "../controller/jobController.js";
import {
  applyJob,
  getJobApplicants,
  updateApplicationStatus,
} from "../controller/applicationController.js";

import {
  verifyEmployer,
  verifyToken,
  verifyWorker,
} from "../middleware/auth.js";
import { midtransNotification } from "../controller/webhookController.js";
import { buySubscription } from "../controller/subscriptionController.js";
import { buyOneTimeQuota } from "../controller/quotaController.js.js";
import { createQuest, getAllQuests, startQuest, submitQuest, assessSubmission } from "../controller/questController.js";
import { getUserPortfolios, getUserPortfolioById } from "../controller/portfolioController.js";
import multer from "multer";
import path from "path";

const router = express.Router();

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

router.get("/", (req, res) => {
  res.send("Hello, World!");
});

router.post("/api/v1/register", register);
router.post("/api/v1/login", login);
router.post("/api/v1/jobs", verifyToken, verifyEmployer, createJob);
router.post("/api/v1/notifications/midtrans", midtransNotification);

router.get(
  "/api/v1/jobs/:jobId/applicants",
  verifyToken,
  verifyEmployer,
  getJobApplicants
);
router.post("/api/v1/jobs/:jobId/apply", verifyToken, verifyWorker, applyJob);
router.patch(
  "/api/v1/applications/:applicationId/status",
  verifyToken,
  verifyEmployer,
  updateApplicationStatus
);

router.post(
  "/api/v1/subscriptions",
  verifyToken,
  verifyEmployer,
  buySubscription
);
router.post("/api/v1/quotas", verifyToken, verifyEmployer, buyOneTimeQuota);

// QUESTS
router.post("/api/v1/quests", verifyToken, verifyEmployer, createQuest);
router.get("/api/v1/quests", getAllQuests);

router.post("/api/v1/quests/:questId/start", verifyToken, verifyWorker, startQuest);
router.post("/api/v1/quests/:questId/submit", verifyToken, verifyWorker, upload.single("file"), submitQuest);
router.patch("/api/v1/submissions/:id/assess", verifyToken, verifyEmployer, assessSubmission);

// PORTFOLIOS
// PORTFOLIOS
router.get("/api/v1/portfolios/:userId", getUserPortfolios);
router.get("/api/v1/portfolios/:userId/:id", getUserPortfolioById);

// Get All Jobs (Bisa filter: ?search=backend&location=jakarta)
router.get("/api/v1/jobs", getAllJobs);

export default router;
