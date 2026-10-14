import { Config } from "@remotion/cli/config";

// Mesmo padrão dos outros projetos do estúdio. O render de verdade sai pelos scripts em scripts/.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setConcurrency(4);
