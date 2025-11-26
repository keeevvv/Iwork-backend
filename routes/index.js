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
import { createQuest, getAllQuests } from "../controller/questController.js";

const router = express.Router();

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

router.post("/api/v1/quests", verifyToken, verifyEmployer, createQuest);

// Get All Jobs (Bisa filter: ?search=backend&location=jakarta)
router.get("/api/v1/jobs", getAllJobs);

// Get All Quests (Bisa filter: ?search=logo&tier=ENTRY)
router.get("/api/v1/quests", getAllQuests);
export default router;
