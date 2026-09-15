import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const HASH_PREFIX = "scrypt";
const HASH_VERSION = "v1";

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

// Gera um hash irreversível para a senha. Formato persistido: scrypt$v1$<salt>$<hash>

export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new Error("A senha não pode ser vazia.");
  }

  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const derivedKey = await deriveKey(password, salt);

  return [
    HASH_PREFIX,
    HASH_VERSION,
    salt,
    derivedKey.toString("hex"),
  ].join("$");
}

// Compara uma senha informada com o hash armazenado.

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const [algorithm, version, salt, hashHex] = storedHash.split("$");

    if (
      algorithm !== HASH_PREFIX ||
      version !== HASH_VERSION ||
      !salt ||
      !hashHex
    ) {
      return false;
    }

    if (!/^[0-9a-f]+$/i.test(hashHex)) {
      return false;
    }

    const storedKey = Buffer.from(hashHex, "hex");

    if (storedKey.length !== KEY_LENGTH) {
      return false;
    }

    const derivedKey = await deriveKey(password, salt);

    return timingSafeEqual(storedKey, derivedKey);
  } catch {
    return false;
  }
}