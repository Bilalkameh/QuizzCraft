package com.quizzcraft.category;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "categories")
class Category {
    enum Status {
        ACTIVE, RETIRED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Enumerated(EnumType.STRING)
    private Status status;

    protected Category() {
    }

    Long id() {
        return id;
    }

    String name() {
        return name;
    }

    Status status() {
        return status;
    }
}
