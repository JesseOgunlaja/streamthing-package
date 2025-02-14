const { createHmac, createECDH } = require("crypto");
const CryptoJS = require("crypto-js");
const { io } = require("socket.io-client");

/**
 * Hashes a string using SHA-256.
 * @param {string} value - The string to hash.
 * @returns {string} The hashed string.
 */
function hashString(value) {
  return CryptoJS.SHA256(value).toString();
}

/**
 * Encrypts a value using AES encryption.
 * @param {string} data - The value to encrypt.
 * @param {string} encryptionKey - The encryption key.
 * @returns {string} The encrypted value.
 */
function encryptValue(data, encryptionKey) {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data),
    String(encryptionKey)
  ).toString();
}

/**
 * Decrypts a string using AES decryption.
 * @param {string} value - The encrypted string to decrypt.
 * @param {string} encryptionKey - The encryption key used for decryption.
 * @returns {*} The decrypted and parsed data.
 */
function decryptString(value, encryptionKey) {
  const decrypted = CryptoJS.AES.decrypt(value, encryptionKey).toString(
    CryptoJS.enc.Utf8
  );
  return JSON.parse(decrypted);
}

const servers = {
  us3: "https://us3.streamthing.dev",
  eus: "https://eus.streamthing.dev",
};

/**
 * Creates a client stream for real-time communication.
 * @param {Object} config - Configuration object for the client stream.
 * @param {string} config.id - The unique identifier for the client.
 * @param {string} config.region - The region of the server to connect to.
 * @param {string} config.channel - The channel to join.
 * @param {string} config.password - The password for authentication.
 * @param {string} config.encryptionKey - The encryption key for decrypting messages.
 * @returns {{
 *   receive: (event: string, callback: (data: unknown) => unknown) => void,
 *   disconnect: () => void
 * }} An object with methods to receive messages and disconnect.
 */
function createClientStream(config) {
  const { id, region, channel, password, encryptionKey } = config;

  const ECDH = createECDH("secp256k1");
  ECDH.generateKeys();
  const publicKey = ECDH.getPublicKey("hex");
  const WEBSOCKET_URL = servers[region];

  const socket = io(WEBSOCKET_URL, {
    transports: ["websocket", "polling"],
    query: {
      channel,
      publicKey,
    },
  });

  socket.on("modulus-secret-server", (serverSecret) => {
    const sharedKey = ECDH.computeSecret(serverSecret, "hex", "hex");
    socket.emit("secret-id", encryptValue(id, sharedKey));
  });
  socket.on("auth", () => {
    socket.emit("challenge", id);
    socket.on("challenge-response", (challenge) => {
      const challengeResult = createHmac("sha256", password)
        .update(challenge)
        .digest("hex");
      socket.emit("authenticate", { id, channel, challenge: challengeResult });
    });
  });

  socket.on("auth_error", (error) => {
    console.error("Authentication failed:", error);
  });

  socket.on("connect_error", (error) => {
    console.error("Connection failed:", error.message);
  });

  return {
    /**
     * Listens for messages on a specific event.
     * @param {string} event - The event name to listen for.
     * @param {Function} callback - The callback function to execute when the event is received.
     */
    receive(event, callback) {
      socket.on(hashString(event), (data) => {
        if (!encryptionKey) return callback(data);
        callback(decryptString(data, encryptionKey));
      });
    },
    /**
     * Disconnects the client from the server.
     */
    disconnect() {
      socket.disconnect();
    },
  };
}

/**
 * Creates a server stream for sending and optionally receiving messages.
 * @param {Object} config - Configuration object for the server stream.
 * @param {string} config.id - The unique identifier for the server.
 * @param {string} config.region - The region of the server to connect to.
 * @param {string} config.channel - The channel to join.
 * @param {string} config.password - The password for authentication.
 * @param {string} config.encryptionKey - The encryption key for encrypting messages.
 * @param {boolean} [config.receiving] - Whether the server should also receive messages.
 * @returns {{
 *   send: (event: string, msg: string) => Promise<void>,
 *   receive?: (event: string, callback: (data: unknown) => unknown) => void,
 *   disconnect?: () => void
 * }} An object with methods to send messages and optionally receive messages.
 * @throws {Error} Throws an error if called in a browser environment.
 */
function createServerStream(config) {
  if (typeof window !== "undefined") {
    throw new Error("Can only create server stream on the server");
  }

  const { id, password, region, channel, encryptionKey } = config;
  const WEBSOCKET_URL = servers[region];

  /**
   * Sends a message to a specific event.
   * @param {string} event - The event name to send the message to.
   * @param {string} msg - The message to send.
   * @returns {Promise<void>} A promise that resolves when the message is sent.
   */
  const send = async (event, msg) => {
    const res = await fetch(`${WEBSOCKET_URL}/emit-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        channel,
        event,
        msg: encryptionKey ? encryptValue(msg, encryptionKey) : msg,
        password,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`An error occurred. Request Body: ${JSON.stringify(data)}`);
    }
  };

  return { send };
}

module.exports = {
  createClientStream,
  createServerStream,
};
