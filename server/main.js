import "dotenv/config";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { expireStaleHolds } from "./src/services/availability.service.js";
import { alertUnassignedJobs } from "./src/services/job-dispatch.service.js";
import { loadSettings } from "./src/services/settings.service.js";
import { ensureDefaultPromotions } from "./src/services/promotion.service.js";
import { expireGiftCards } from "./src/services/gift-card.service.js";
import { deliverDueGiftCards } from "./src/services/gift-card-purchase.service.js";

const PORT = process.env.PORT || 3100;

const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectDB();

    // Admin-managed prices & rules (Admin → Einstellungen)
    await loadSettings();
    // Welcome offer + Christmas campaign (created once, then admin-managed)
    await ensureDefaultPromotions();

    // Start Express server after database connection
    const server = app.listen(PORT, () => {
      console.log("-----------------------------------");
      console.log("       FIDUXA BACKEND SERVER");
      console.log("-----------------------------------");
      console.log(`Server running on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log("-----------------------------------");
    });

    // Release slots whose payment was not completed in time (every minute)
    const holdTimer = setInterval(() => {
      expireStaleHolds()
        .then((count) => count && console.log(`Expired ${count} unpaid reservation(s).`))
        .catch((error) => console.error("Hold expiry failed:", error.message));
      // Gift cards: scheduled delivery, unpaid purchases, expiry
      deliverDueGiftCards().catch((error) => console.error("Gift card delivery failed:", error.message));
      expireGiftCards().catch((error) => console.error("Gift card expiry failed:", error.message));
      // Pick up settings changed by another server instance
      loadSettings().catch((error) => console.error("Settings reload failed:", error.message));
      alertUnassignedJobs().catch((error) =>
        console.error("Unassigned job alert failed:", error.message)
      );
    }, 60 * 1000);

    const shutdown = (signal) => {
      console.log(`${signal} received. Closing server...`);
      clearInterval(holdTimer);

      server.close(() => {
        console.log("Server closed successfully.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start Fiduxa server:", error);
    process.exit(1);
  }
};

startServer();
