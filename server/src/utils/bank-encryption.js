import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const getKey = () => {
  const key = process.env.BANK_DETAILS_ENCRYPTION_KEY;

  if (!key || !/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error("Invalid bank encryption key.");
  }

  return Buffer.from(key, "hex");
};

export const encryptBankDetails = (details) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(details), "utf8"),
    cipher.final(),
  ]);

  return {
    encrypted: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
};

export const decryptBankDetails = ({ encrypted, iv, authTag }) => {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
};
