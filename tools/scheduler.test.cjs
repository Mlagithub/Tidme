const test = require("node:test");
const assert = require("node:assert/strict");
const { composeGlobalLearningQueue } = require("../src/tidme/core/deck-engine.ts");

test("composeGlobalLearningQueue — topics:true 交错比例（mock 求值器）", () => {
	const mockEvaluate = (filter) => {
		if (filter.includes("tidme.kind[topic]")) {
			return ["Extract High Priority (p10)", "Extract Low Priority (p80)"];
		}
		return ["Cloze Card 1", "QA Card 2", "Cloze Card 3", "QA Card 4", "Cloze Card 5"];
	};

	const queue = composeGlobalLearningQueue(mockEvaluate, { itemRatio: 3, topicRatio: 1, topics: true });

	assert.deepEqual(queue, [
		"Cloze Card 1", "QA Card 2", "Cloze Card 3",
		"Extract High Priority (p10)",
		"QA Card 4", "Cloze Card 5",
		"Extract Low Priority (p80)"
	]);
});

test("composeGlobalLearningQueue — 默认纯知识卡（topic 不混入）", () => {
	const mockEvaluate = (filter) => {
		if (filter.includes("tidme.kind[topic]")) {
			return ["Extract High Priority (p10)", "Extract Low Priority (p80)"];
		}
		return ["Cloze Card 1", "QA Card 2", "Cloze Card 3", "QA Card 4", "Cloze Card 5"];
	};

	const queue = composeGlobalLearningQueue(mockEvaluate, { itemRatio: 3, topicRatio: 1 });
	assert.deepEqual(queue, ["Cloze Card 1", "QA Card 2", "Cloze Card 3", "QA Card 4", "Cloze Card 5"], "默认不取 topic");
});
