import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import User from "../models/user.model.js";

const rl = readline.createInterface({ input, output });

const ask = (question) => rl.question(question);

const main = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const name = (await ask("Admin name: ")).trim();
    const email = (await ask("Admin email: ")).trim().toLowerCase();
    const password = await ask("Admin password: ");

    if (name.length < 2 || !email.includes("@") || password.length < 12) {
      throw new Error(
        "Enter a valid name, email and password of at least 12 characters."
      );
    }

    const existing = await User.findOne({ email });

    if (existing) {
      throw new Error("An account with this email already exists.");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
    });

    console.log(`Admin created successfully: ${admin.email}`);
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    rl.close();
  }
};

main();
