const test = require("node:test");
const assert = require("node:assert/strict");
const { interleaveQueues } = require("../src/tidme/core/scheduler.ts");
const { composeGlobalLearningQueue } = require("../src/tidme/core/deck-engine.ts");

test("SuperMemo Interleaving — Queue ratio (4:1)", () => {
	const items = ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"];
	const topics = ["Topic A", "Topic B"];

	const result = interleaveQueues(items, topics, { itemRatio: 4, topicRatio: 1 });

	assert.deepEqual(result, [
		"Item 1", "Item 2", "Item 3", "Item 4",
		"Topic A",
		"Item 5", "Item 6",
		"Topic B"
	]);
});

test("SuperMemo Interleaving — Empty topic fallback", () => {
	const items = ["Item 1", "Item 2"];
	const topics = [];

	const result = interleaveQueues(items, topics, { itemRatio: 4, topicRatio: 1 });
	assert.deepEqual(result, ["Item 1", "Item 2"]);
});

test("composeGlobalLearningQueue — Full combination test", () => {
	const mockEvaluate = (filter) => {
		if (filter.includes("tidme.kind[topic]")) {
			return ["Extract High Priority (p10)", "Extract Low Priority (p80)"];
		}
		return ["Cloze Card 1", "QA Card 2", "Cloze Card 3", "QA Card 4", "Cloze Card 5"];
	};

	const queue = composeGlobalLearningQueue(mockEvaluate, { itemRatio: 3, topicRatio: 1 });

	assert.deepEqual(queue, [
		"Cloze Card 1", "QA Card 2", "Cloze Card 3",
		"Extract High Priority (p10)",
		"QA Card 4", "Cloze Card 5",
		"Extract Low Priority (p80)"
	]);
});
