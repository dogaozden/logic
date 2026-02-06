import express from "express";
import cors from "cors";

import generateRoutes from "./routes/generate";
import validateRoutes from "./routes/validate";
import theoremSetRoutes from "./routes/theoremSets";
import benchmarkRoutes from "./routes/benchmark";
import resultsRoutes from "./routes/results";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/generate", generateRoutes);
app.use("/api/validate", validateRoutes);
app.use("/api/theorem-sets", theoremSetRoutes);
app.use("/api/benchmark", benchmarkRoutes);
app.use("/api/runs", resultsRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`PropBench API server listening on http://localhost:${PORT}`);
});
