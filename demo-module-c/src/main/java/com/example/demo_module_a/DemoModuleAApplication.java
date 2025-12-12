package com.example.demo_module_a;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Demo Module C Application.
 * This module demonstrates independent versioning in a Maven monorepo.
 */
@SpringBootApplication
public class DemoModuleAApplication {

	public static void main(String[] args) {
		SpringApplication.run(DemoModuleAApplication.class, args);
	}

}
