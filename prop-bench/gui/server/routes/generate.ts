import { Router, Request, Response } from "express";
import { generate } from "../cli";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { count, distribution, name } = req.body;

    console.log(`[generate] POST / - Generating ${count} theorems for set '${name}' with distribution '${distribution}'`);

    if (!count || !distribution || !name) {
      res.status(400).json({ error: "Missing required fields: count, distribution, name" });
      return;
    }

    if (typeof count !== "number" || count < 1) {
      res.status(400).json({ error: "count must be a positive number" });
      return;
    }

    if (typeof distribution !== "string") {
      res.status(400).json({ error: "distribution must be a string like '30:easy,30:medium,...'" });
      return;
    }

    if (typeof name !== "string" || !name.match(/^[a-zA-Z0-9_-]+$/)) {
      res.status(400).json({ error: "name must be alphanumeric (with dashes/underscores)" });
      return;
    }

    const result = await generate({ count, distribution, name });
    console.log(`[generate] Successfully generated ${result.theorems.length} theorems at ${result.path}`);
    res.json({ success: true, path: result.path, theorems: result.theorems });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate] ERROR:", err);
    res.status(500).json({ error: msg });
  }
});

export default router;
