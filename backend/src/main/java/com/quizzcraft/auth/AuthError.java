package com.quizzcraft.auth;

import java.util.List;

record AuthError(String error, String message, List<FieldError> fieldErrors) {
    record FieldError(String field, String message) {}

    static AuthError of(String error, String message) {
        return new AuthError(error, message, List.of());
    }
}
