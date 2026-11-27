package com.quizzcraft.category;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CategoryController {
    private final CategoryRepository categories;

    CategoryController(CategoryRepository categories) {
        this.categories = categories;
    }

    @GetMapping("/api/categories")
    public List<CategoryResponse> listCategories() {
        return categories.findAllByOrderByIdAsc().stream()
                .map(category -> new CategoryResponse(category.id(), category.name(), category.status().name()))
                .toList();
    }

    public record CategoryResponse(long id, String name, String status) {
    }
}
