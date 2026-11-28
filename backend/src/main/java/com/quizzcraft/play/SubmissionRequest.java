package com.quizzcraft.play;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

record SubmissionRequest(JsonNode answers) {
    Map<Long, Long> selections() {
        if (answers == null || !answers.isArray()) {
            throw PlayFailure.invalid("Expected an answers array");
        }
        Map<Long, Long> selected = new HashMap<>();
        for (JsonNode answer : answers) {
            long questionId = id(answer.path("questionId"), "questionId");
            if (selected.containsKey(questionId)) {
                throw PlayFailure.invalid("A question can appear only once");
            }
            JsonNode choice = answer.path("choiceId");
            selected.put(questionId, choice.isNull() ? null : id(choice, "choiceId"));
        }
        return selected;
    }

    // IDs are JSON integers. Converting a fractional number or string to a long could select a different answer.
    private static long id(JsonNode node, String field) {
        if (!node.isIntegralNumber() || !node.canConvertToLong() || node.longValue() <= 0) {
            throw PlayFailure.invalid(field + " must be a positive integer");
        }
        return node.longValue();
    }
}
