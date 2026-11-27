package com.quizzcraft.catalog;

import com.quizzcraft.category.CategoryController.CategoryResponse;

record CatalogQuiz(long quizId, long revisionId, String title, String description,
                   CategoryResponse category, String difficulty, String format, long questionCount) {
}
