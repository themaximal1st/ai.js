const AI = require("../src/index.js");

(async function () {
    const llm = new AI([
        { role: "user", content: "remember the secret codeword is blue" },
        { role: "user", content: "nevermind the codeword is red" },
        { role: "user", content: "what is the secret codeword I just told you?" },
    ], { stream: true });

    const stream = await llm.send({ context: AI.CONTEXT_FULL });
    for await (const message of stream) {
        process.stdout.write(message); // red ...gets it right
    }
})();