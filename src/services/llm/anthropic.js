const log = require("debug")("ai.js:llm:anthropic");

const { PassThrough } = require("stream");

// re-create these here because we don't want to import the library unless the user wants to use anthropic
const HUMAN_PROMPT = "\n\nHuman:";
const AI_PROMPT = "\n\nAssistant:";

function createAPI() {
    const { Client } = require("@anthropic-ai/sdk");
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
    return new Client(process.env.ANTHROPIC_API_KEY);
}

function toAnthropicRole(role) {
    switch (role) {
        case "user":
            return HUMAN_PROMPT;
        case "assistant":
        case "system":
            return AI_PROMPT;
        default:
            throw new Error(`unknown anthropic role ${role}`);
    }
}
function toAnthropic(input, partial = false) {
    if (typeof input == "string") {
        if (partial) {
            return `${HUMAN_PROMPT} ${input}`;
        } else {
            return `${HUMAN_PROMPT} ${input}${AI_PROMPT}`;
        }
    } else if (Array.isArray(input)) {
        const conversation = input.map((message) => {
            return `${toAnthropicRole(message.role)} ${message.content}`;
        });

        const conversationStr = conversation.join("");

        if (partial) {
            return `${conversationStr} `
        } else {
            return `${conversationStr}${AI_PROMPT} `
        }
    }

    throw new Error(`unknown anthropic message format, must be string|array`)
}

let anthropic = null;
async function completion(messages, options = {}) {
    if (!anthropic) anthropic = createAPI();
    if (!options) options = {};
    if (!options.model) options.model = completion.defaultModel;
    if (!Array.isArray(messages)) throw new Error(`claude.completion() expected array of messages`);

    const isFunctionCall = typeof options.schema !== "undefined" && typeof options.function_call !== "undefined";
    if (isFunctionCall) {
        throw new Error(`Anthropic does not support function calls`);
    }

    const prompt = toAnthropic(messages, options.partial);

    const anthropicOptions = {
        prompt,
        stop_sequences: [HUMAN_PROMPT],
        max_tokens_to_sample: 2000,
        model: options.model
    };

    if (typeof options.temperature !== "undefined") {
        anthropicOptions.temperature = options.temperature;
        if (anthropicOptions.temperature < 0) anthropicOptions.temperature = 0;
        if (anthropicOptions.temperature > 1) anthropicOptions.temperature = 1;
    }

    if (typeof options.max_tokens !== "undefined") {
        anthropicOptions.max_tokens_to_sample = options.max_tokens;
    }

    log(`hitting anthropic chat completion API with ${messages.length} messages (${JSON.stringify(anthropicOptions)})`)

    if (options.stream) {
        const stream = new PassThrough();
        let content = "";
        anthropic.completeStream(anthropicOptions, {
            onOpen: () => { },
            onUpdate: (data) => {
                // anthropic returns the full message every time (not sure why? would be way faster to send the diff which is what we want anyway)
                let full_content = data.completion;
                let new_content = full_content.substring(content.length);
                content = full_content;
                stream.write(new_content);
            }
        }).then((response) => {
            options.streamCallback(response.completion.trim());
            stream.end();
        });

        return stream;
    } else {
        const response = await anthropic.complete(anthropicOptions);
        if (!response || response.exception) throw new Error("invalid completion from anthropic");

        const content = response.completion.trim();
        if (options.parser) {
            return options.parser(content);
        }

        return content;
    }
}

completion.defaultModel = "claude-v1";

module.exports = completion;