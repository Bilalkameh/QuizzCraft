package com.quizzcraft.category;

import java.util.List;

import org.springframework.data.repository.Repository;

interface CategoryRepository extends Repository<Category, Long> {
    List<Category> findAllByOrderByIdAsc();
}
