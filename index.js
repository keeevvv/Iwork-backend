import express from "express";
import router from "./routes/index.js";
import cookieParser from "cookie-parser";
import cors from "cors";
const app = express();

app.use(cors());

app.use(cookieParser());
app.use(express.json());
app.use(router);
app.listen(3000, () => {
  console.log("server running on port 3000");
});
export default app;