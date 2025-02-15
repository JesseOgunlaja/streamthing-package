const CryptoJS = require("crypto-js");
const { io } = require("socket.io-client");
const { SignJWT } = require("jose");

function hashString(value) {
  return CryptoJS.SHA256(value).toString();
}

async function encodeJWT(payload, secretKey, duration) {
  const secret = new TextEncoder().encode(secretKey);

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + duration)
    .sign(secret);

  return jwt;
}

const servers = {
  us3: "https://us3.streamthing.dev",
  eus: "https://eus.streamthing.dev",
};

/**
 * Creates a JWT token for authentication. ONLY TO BE USED ON THE SERVER.
 * @param {Object} config - Configuration object for creating the token.
 * @param {string} config.id - The unique identifier for the server.
 * @param {string} config.channel - The channel to join.
 * @param {string} config.password - The password for authentication.
 * @param {string} config.socketID - The socket ID for authentication.
 * @returns {Promise<string>} The JWT token.
 */
async function createToken({ id, channel, password, socketID }) {
  if (typeof window !== "undefined") {
    throw new Error("Can only create token on the server");
  }
  return await encodeJWT({ id, channel }, `${socketID}-${password}`, 5);
}

/**
 * Creates a client stream for real-time communication.
 * @param {string} region - The region of the server to connect to.
 * @returns {Promise<{
 *   id: string,
 *   authenticate: (token: string) => void,
 *   receive: (event: string, callback: (data: unknown) => unknown) => void,
 *   disconnect: () => void
 * }>}
 */
function createClientStream(region) {
  return new Promise((resolve, reject) => {
    const WEBSOCKET_URL = servers[region];
    const socket = io(WEBSOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      resolve({
        id: socket.id,
        authenticate(token) {
          socket.emit("authenticate", token);
        },
        receive(event, callback) {
          socket.on(hashString(event), callback);
        },
        disconnect() {
          socket.disconnect();
        },
      });
    });

    socket.on("auth_error", (error) => {
      console.error(`Auth error: ${error.message}`);
      reject(error);
    });

    socket.on("connect_error", (error) => {
      console.error("Connection failed:", error.message);
      reject(error);
    });
  });
}

/**
 * Creates a server stream for sending and optionally receiving messages.
 * @param {Object} config - Configuration object for the server stream.
 * @param {string} config.id - The unique identifier for the server.
 * @param {string} config.region - The region of the server to connect to.
 * @param {string} config.channel - The channel to join.
 * @param {string} config.password - The password for authentication.
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

  const { id, password, region, channel } = config;
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
        msg,
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
  createToken,
  createServerStream,
};
