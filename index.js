const { SignJWT } = require("jose");

async function encodeJWT(payload, secretKey, duration) {
	const secret = new TextEncoder().encode(secretKey);

	const jwt = await new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime(Math.floor(Date.now() / 1000) + duration)
		.sign(secret);

	return jwt;
}

const { STREAMTHING_CUSTOM_HOST: CUSTOM_HOST } = process.env;

const servers = {
	usw: CUSTOM_HOST || "wss://usw.streamthing.dev",
	us3: CUSTOM_HOST || "wss://us3.streamthing.dev",
	eus: CUSTOM_HOST || "wss://eus.streamthing.dev",
};

/**
 * Creates a JWT token for authentication. ONLY TO BE USED ON THE SERVER.
 * @param {Object} config - Configuration object for creating the token.
 * @param {string} config.channel - The channel to join.
 * @param {string} config.password - The password for authentication.
 * @returns {Promise<string>} The JWT token.
 * @throws {Error} If called in a browser environment.
 */
async function createToken({ channel, password }) {
	if (typeof window !== "undefined") {
		throw new Error("Can only create token on the server");
	}

	return await encodeJWT({ channel }, password, 300);
}

/**
 * Creates a client stream for real-time communication.
 * @param {Object} config - Configuration object for the client stream.
 * @param {string} config.region - The region of the server to connect to.
 * @param {string} config.id - The unique identifier for the server.
 * @param {string} config.token - The authentication token.
 * @returns {{
 *   receive: (event: string, callback: (data: string) => void) => void,
 *   disconnect: () => void
 * }} A client stream object for interacting with the server.
 */
function createClientStream({ region, id, token }) {
	let socket = null;
	const listeners = new Map();
	let controller = new AbortController();

	function connect() {
		if (socket) {
			socket.close();
			controller.abort();
		}

		controller = new AbortController();
		socket = new WebSocket(`${servers[region]}?id=${id}`);

		socket.addEventListener(
			"error",
			(error) => {
				console.error(`WebSocket error:`, error);
			},
			{ signal: controller.signal },
		);

		socket.addEventListener(
			"message",
			(message) => {
				const data = JSON.parse(message.data);

				if (data.type === "error") {
					console.error(`WebSocket error: ${data.message}`);
				} else if (data.type === "message") {
					const callback = listeners.get(data.event);
					callback && callback(data.payload);
				}
			},
			{ signal: controller.signal },
		);

		socket.addEventListener(
			"open",
			() => socket.send(JSON.stringify({ type: "authenticate", token })),
			{ signal: controller.signal },
		);

		socket.addEventListener("close", () => setTimeout(connect, 5000), {
			signal: controller.signal,
		});
	}

	connect();

	return {
		receive(event, callback) {
			listeners.set(event, callback);
		},
		disconnect() {
			if (socket) {
				controller.abort();
				socket?.close();
			}
		},
	};
}

/**
 * Creates a server stream for sending messages.
 * ONLY TO BE USED ON THE SERVER.
 * @param {Object} config - Configuration object for the server stream.
 * @param {string} config.id - The unique identifier for the server.
 * @param {string} config.region - The region of the server to connect to.
 * @param {string} config.password - The password for authentication.
 * @returns {{
 *   send: (channel: string, event: string, message: string) => void,
 * }} An object with methods to send messages to the server.
 * @throws {Error} If called in a browser environment.
 */
function createServerStream(config) {
	if (typeof window !== "undefined") {
		throw new Error("Can only create server stream on the server");
	}

	const { id, region, password } = config;

	let socket = null;
	let isAuthenticated = false;
	let controller = new AbortController();
	const messageQueue = [];

	function connect() {
		if (socket) {
			controller.abort();
			socket.close();
		}

		isAuthenticated = false;
		socket = new WebSocket(servers[region]);
		controller = new AbortController();

		socket.addEventListener(
			"open",
			() => {
				socket.send(
					JSON.stringify({
						type: "server-authenticate",
						serverId: id,
						password,
					}),
				);
			},
			{ signal: controller.signal },
		);

		socket.addEventListener(
			"message",
			(message) => {
				const data = JSON.parse(message.data);
				if (data.type === "error") {
					console.error(`WebSocket error: ${data.message}`);
				} else if (data.type === "server-authenticated") {
					isAuthenticated = true;

					while (messageQueue.length > 0) {
						socket.send(messageQueue.shift());
					}
				}
			},
			{ signal: controller.signal },
		);

		socket.addEventListener(
			"error",
			(error) => console.error("WebSocket error:", error),
			{ signal: controller.signal },
		);

		socket.addEventListener("close", () => (isAuthenticated = false), {
			signal: controller.signal,
		});
	}

	connect();

	setInterval(() => {
		if (!socket || socket.readyState !== WebSocket.OPEN || !isAuthenticated) {
			connect();
		}
	}, 10000);

	return {
		send(channel, event, message) {
			const payload = JSON.stringify({
				type: "emit",
				event,
				message,
				channel,
			});

			if (socket && socket.readyState === WebSocket.OPEN && isAuthenticated) {
				socket.send(payload);
			} else messageQueue.push(payload);
		},
	};
}

module.exports = {
	createClientStream,
	createToken,
	createServerStream,
};
