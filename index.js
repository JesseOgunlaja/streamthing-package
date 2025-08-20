const { SignJWT } = require("jose");

async function encodeJWT(payload, secretKey, duration) {
  const secret = new TextEncoder().encode(secretKey);

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + duration)
    .sign(secret);

  return jwt;
}

const servers = {
  usw: "wss://usw.streamthing.dev",
  us3: "wss://us3.streamthing.dev",
  eus: "wss://eus.streamthing.dev",
};

/**
 * Creates a JWT token for authentication. ONLY TO BE USED ON THE SERVER.
 * @param {Object} config - Configuration object for creating the token.
 * @param {string} config.id - The unique identifier for the server.
 * @param {string} config.channel - The channel to join.
 * @param {string} config.password - The password for authentication.
 * @param {string} config.socketId - The socket ID for authentication.
 * @returns {Promise<string>} The JWT token.
 * @throws {Error} If called in a browser environment.
 */
async function createToken({ id, channel, password, socketId }) {
  if (typeof window !== "undefined") {
    throw new Error("Can only create token on the server");
  }

  return await encodeJWT({ id, channel }, `${socketId}-${password}`, 5);
}

/**
 * Creates a client stream for real-time communication.
 * @param {string} region - The region of the server to connect to.
 * @returns {Promise<{
 *   id: string,
 *   authenticate: (token: string) => void,
 *   send: (event: string, message: string) => void,
 *   receive: (event: string, callback: (data: string) => void) => void,
 *   disconnect: () => void
 * }>} A client stream object for interacting with the server.
 */
function createClientStream(region) {
  return new Promise((resolve, reject) => {
    const WEBSOCKET_URL = servers[region];
    const socket = new WebSocket(WEBSOCKET_URL);

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      reject(error);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "auth_error") {
          console.error(`Auth error: ${data.message}`);
          reject(new Error(data.message));
        } else if (data.type === "connection_id") {
          resolve({
            id: data.id,
            authenticate(token) {
              socket.send(JSON.stringify({ type: "authenticate", token }));
            },
            receive(event, callback) {
              socket.addEventListener("message", (messageEvent) => {
                const data = JSON.parse(messageEvent.data);
                if (data.type === "message" && data.event === event) {
                  callback(data.payload);
                }
              });
            },
            send(event, message) {
              socket.send(
                JSON.stringify({ type: "emit_event", data: { event, message } })
              );
            },
            disconnect: socket.close,
          });
        }
      } catch (err) {
        console.error(`Unexpected error: ${err}`);
      }
    };
  });
}

/**
 * Creates a server stream for sending messages.
 * ONLY TO BE USED ON THE SERVER.
 * @param {Object} config - Configuration object for the server stream.
 * @param {string} config.id - The unique identifier for the server.
 * @param {string} config.region - The region of the server to connect to.
 * @param {string} config.channel - The channel to join.
 * @param {string} config.password - The password for authentication.
 * @returns {{
 *   send: (event: string, message: string) => Promise<void>,
 * }} An object with methods to send messages to the server.
 * @throws {Error} If called in a browser environment.
 */
function createServerStream(config) {
  if (typeof window !== "undefined") {
    throw new Error("Can only create server stream on the server");
  }

  const { channel, id, region, password } = config;
  const WEBSOCKET_URL = servers[region].replace("wss", "https");

  return {
    async send(event, message) {
      const res = await fetch(`${WEBSOCKET_URL}/emit-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, channel, event, message, password }),
      });

      const data = await res.json();
      if (!res.ok) console.error(`An error occurred: ${JSON.stringify(data)}`);
    },
  };
}

module.exports = {
  createClientStream,
  createToken,
  createServerStream,
};
