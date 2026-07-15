allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

subprojects {
    val fixNamespace = {
        extensions.findByName("android")?.let { androidExt ->
            try {
                val getNamespaceMethod = androidExt.javaClass.getMethod("getNamespace")
                val currentNamespace = getNamespaceMethod.invoke(androidExt)
                if (currentNamespace == null) {
                    val setNamespaceMethod = androidExt.javaClass.getMethod("setNamespace", String::class.java)
                    setNamespaceMethod.invoke(androidExt, project.group.toString())
                }
            } catch (e: Exception) {
                // Safely ignore if the subproject isn't a standard Android module
            }
        }
    }

    if (state.executed) {
        fixNamespace()
    } else {
        afterEvaluate { fixNamespace() }
    }
}