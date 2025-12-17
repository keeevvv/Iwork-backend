import express from "express";
import { initCronJob } from "./cron/subscriptionScheduler.js";
import router from "./routes/index.js";
import cookieParser from "cookie-parser";
import cors from "cors";
const app = express();

app.use(cors());

app.use(cookieParser());
app.use(express.json());
app.use("/public", express.static("public"));
app.use(router);
initCronJob(); // <--- Jalankan mesin waktu
app.listen(3000, () => {
  console.log("server running on port 3000");
});
export default app;