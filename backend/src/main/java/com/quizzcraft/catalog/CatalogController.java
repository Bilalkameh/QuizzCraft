package com.quizzcraft.catalog;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/quizzes")
public class CatalogController {
    enum Difficulty {
        EASY, MEDIUM, HARD
    }

    enum FormatFilter {
        MULTIPLE_CHOICE, TRUE_FALSE
    }

    private final CatalogRepository catalog;

    CatalogController(CatalogRepository catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    CatalogResponse browse(@RequestParam(required = false) Long categoryId,
                           @RequestParam(required = false) Difficulty difficulty,
                           @RequestParam(required = false) FormatFilter format) {
        return new CatalogResponse(catalog.browse(categoryId,
                difficulty == null ? null : difficulty.name(),
                format == null ? null : format.name()));
    }

    @GetMapping("/{quizId}")
    ResponseEntity<CatalogQuiz> detail(@PathVariable long quizId) {
        return ResponseEntity.of(catalog.findPublicQuiz(quizId));
    }

    record CatalogResponse(List<CatalogQuiz> items) {
    }
}
