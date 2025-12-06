package com.example.demo_module_a;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

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
		return "0.0.1-SNAPSHOT";
	}

}
