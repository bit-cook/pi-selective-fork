import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";

describe("ModelRuntime visible models", () => {
	const directories: string[] = [];

	afterEach(() => {
		for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true });
		directories.length = 0;
	});

	it("keeps explicitly declared unauthenticated models visible but unavailable", async () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-visible-models-"));
		directories.push(directory);
		const modelsPath = path.join(directory, "models.json");
		fs.writeFileSync(
			modelsPath,
			JSON.stringify({
				providers: {
					custom: {
						api: "openai-completions",
						baseUrl: "https://example.invalid/v1",
						models: [
							{
								contextWindow: 10000,
								cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
								id: "declared",
								input: ["text"],
								maxTokens: 1000,
								name: "Declared",
								reasoning: false,
							},
						],
					},
				},
			}),
		);
		const runtime = await ModelRuntime.create({ credentials: AuthStorage.inMemory(), modelsPath });

		expect(runtime.getVisibleSnapshot().map((model) => `${model.provider}/${model.id}`)).toContain("custom/declared");
		expect(runtime.getAvailableSnapshot().map((model) => `${model.provider}/${model.id}`)).not.toContain(
			"custom/declared",
		);
		expect(runtime.hasConfiguredAuth("custom")).toBe(false);
	});
});
