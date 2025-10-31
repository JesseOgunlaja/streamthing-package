const {
	createClientStream,
	createServerStream,
	createToken,
} = require("./index.js");

const { TEST_SERVER_ID, TEST_SERVER_PASSWORD, TEST_SERVER_REGION } =
	process.env;
const CHANNEL = "test-channel";

async function runTest() {
	const token = await createToken({
		channel: CHANNEL,
		password: TEST_SERVER_PASSWORD,
	});
	const client = createClientStream({
		region: TEST_SERVER_REGION,
		id: TEST_SERVER_ID,
		token,
	});

	const server = createServerStream({
		id: TEST_SERVER_ID,
		region: TEST_SERVER_REGION,
		password: TEST_SERVER_PASSWORD,
	});
	server.send(CHANNEL, "message", "test-success");

	try {
		await new Promise((resolve, reject) => {
			client.receive("message", (message) =>
				message === "test-success"
					? resolve("Success")
					: reject(new Error("Message did not match")),
			);
			setTimeout(() => reject(new Error("Timeout waiting for message")), 10000);
		});
		client.disconnect();
		process.exit(0);
	} catch {
		process.exit(1);
	}
}

runTest();
