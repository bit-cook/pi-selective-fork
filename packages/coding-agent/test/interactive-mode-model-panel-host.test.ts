import { describe, expect, it, vi } from "vitest";
import type { BuiltinModelPanelRuntime } from "../src/core/extensions/types.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type ModelPanelHostThis = {
	session: {
		extensionRunner: {
			getBuiltinModelPanel(): object | undefined;
			invokeBuiltinModelPanelOpen(
				request: { query?: string; trigger: "command" | "select-shortcut" },
				runtime: BuiltinModelPanelRuntime,
			): Promise<boolean>;
			invokeBuiltinModelPanelCycle(
				request: { direction: "forward" | "backward"; trigger: "cycle-forward" | "cycle-backward" },
				runtime: BuiltinModelPanelRuntime,
			): Promise<boolean>;
		};
	};
	createBuiltinModelPanelRuntime(): BuiltinModelPanelRuntime;
	showModelSelector(query?: string): void;
	cycleModel(direction: "forward" | "backward"): Promise<void>;
	showError(message: string): void;
};

type ModelPanelHostPrototype = {
	openBuiltinModelPanel(
		this: ModelPanelHostThis,
		query?: string,
		trigger?: "command" | "select-shortcut",
	): Promise<boolean>;
	handleBuiltinModelPanelCycle(this: ModelPanelHostThis, direction: "forward" | "backward"): Promise<void>;
};

const prototype = InteractiveMode.prototype as unknown as ModelPanelHostPrototype;

function createSubject(owner: boolean) {
	const runtime = { custom: vi.fn() } as unknown as BuiltinModelPanelRuntime;
	const invokeOpen = vi.fn(async () => true);
	const invokeCycle = vi.fn(async () => true);
	const showModelSelector = vi.fn();
	const cycleModel = vi.fn(async () => {});
	const showError = vi.fn();
	const subject: ModelPanelHostThis = {
		session: {
			extensionRunner: {
				getBuiltinModelPanel: () => (owner ? {} : undefined),
				invokeBuiltinModelPanelOpen: invokeOpen,
				invokeBuiltinModelPanelCycle: invokeCycle,
			},
		},
		createBuiltinModelPanelRuntime: () => runtime,
		showModelSelector,
		cycleModel,
		showError,
	};
	return { cycleModel, invokeCycle, invokeOpen, runtime, showError, showModelSelector, subject };
}

describe("InteractiveMode built-in model panel host", () => {
	it("routes command, select, and cycle requests to one registered owner", async () => {
		const value = createSubject(true);
		expect(await prototype.openBuiltinModelPanel.call(value.subject, " provider/model ", "command")).toBe(true);
		expect(await prototype.openBuiltinModelPanel.call(value.subject)).toBe(true);
		await prototype.handleBuiltinModelPanelCycle.call(value.subject, "backward");
		expect(value.invokeOpen).toHaveBeenNthCalledWith(
			1,
			{ query: " provider/model ", trigger: "command" },
			value.runtime,
		);
		expect(value.invokeOpen).toHaveBeenNthCalledWith(
			2,
			{ query: undefined, trigger: "select-shortcut" },
			value.runtime,
		);
		expect(value.invokeCycle).toHaveBeenCalledWith(
			{ direction: "backward", trigger: "cycle-backward" },
			value.runtime,
		);
		expect(value.showModelSelector).not.toHaveBeenCalled();
		expect(value.cycleModel).not.toHaveBeenCalled();
	});

	it("preserves selector and cycle fallback when no adapter is registered", async () => {
		const value = createSubject(false);
		expect(await prototype.openBuiltinModelPanel.call(value.subject, "query")).toBe(false);
		await prototype.handleBuiltinModelPanelCycle.call(value.subject, "forward");
		expect(value.showModelSelector).toHaveBeenCalledWith("query");
		expect(value.cycleModel).toHaveBeenCalledWith("forward");
		expect(value.invokeOpen).not.toHaveBeenCalled();
		expect(value.invokeCycle).not.toHaveBeenCalled();
	});

	it("reports adapter errors without falling through to built-in behavior", async () => {
		const value = createSubject(true);
		value.invokeOpen.mockRejectedValueOnce(new Error("adapter failed"));
		expect(await prototype.openBuiltinModelPanel.call(value.subject)).toBe(true);
		expect(value.showError).toHaveBeenCalledWith("adapter failed");
		expect(value.showModelSelector).not.toHaveBeenCalled();
	});
});
