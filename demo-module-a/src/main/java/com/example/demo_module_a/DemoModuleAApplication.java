package com.example.demo_module_a;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Main application class for Demo Module A.
 * This is a demonstration Spring Boot library module for testing
 * selective versioning and publishing workflows.
 *
 * BREAKING CHANGE: Added new API for module information.
 * This is a major version bump to test downstream PR generation.
 */
@SpringBootApplication
public class DemoModuleAApplication {

	public static void main(String[] args) {
		SpringApplication.run(DemoModuleAApplication.class, args);
	}

	/**
	 * Utility method to get the module version.
	 * This method returns the current version of demo-module-a.
	 * @return the module version string
	 */
	public static String getVersion() {
		return "1.0.0-SNAPSHOT";
	}

	/**
	 * NEW API: Get module name.
	 * @return the module name
	 */
	public static String getModuleName() {
		return "demo-module-a";
	}

	/**
	 * NEW API: Get module description.
	 * @return the module description
	 */
	public static String getModuleDescription() {
		return "Demo Module A - Core library for testing selective versioning";
	}

}
