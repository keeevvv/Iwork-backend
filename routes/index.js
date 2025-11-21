import express from "express";
import { register,login } from "../controller/userController.js";
import { createJob } from "../controller/jobController.js";
import { applyJob, getJobApplicants } from "../controller/applicationController.js";

import { verifyEmployer, verifyToken, verifyWorker } from "../middleware/auth.js";
import { midtransNotification } from "../controller/webhookController.js";


const router = express.Router();

router.get("/", (req, res) => {
  res.send("Hello, World!");
});

  router.post("/api/v1/register", register);
  router.post("/api/v1/login", login);
  router.post("/api/v1/jobs", verifyToken, verifyEmployer, createJob);
  router.post("/api/v1/notifications/midtrans", midtransNotification);



  router.get("/api/v1/jobs/:jobId/applicants", verifyToken, verifyEmployer, getJobApplicants);
  router.post("/api/v1/jobs/:jobId/apply", verifyToken, verifyWorker, applyJob);
export default router;