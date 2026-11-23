/** Uses the same schemas as normal section saves; imported only inside admin handlers. */
export async function validateRestore(
  section: string,
  raw: unknown,
): Promise<Record<string, unknown>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid restore");
  const r = raw as Record<string, unknown>;
  const a = await import("./admin.functions");
  switch (section) {
    case "general":
      a.generalSettingsSchema.parse({
        displayTitle: r["display_title"],
        displayTitleEn: r["display_title_en"],
        arabicTitle: r["arabic_title"],
        tagline: r["tagline"],
        taglineEn: r["tagline_en"],
        description: r["description"],
        descriptionEn: r["description_en"],
        footerText: r["footer_text"],
        footerTextEn: r["footer_text_en"],
        footerLinks: r["footer_links"],
        logoUrl: r["logo_url"],
      });
      break;
    case "appearance":
      a.appearanceSettingsSchema.parse({
        headingFont: r["heading_font"],
        bodyFont: r["body_font"],
        colors: r["colors"],
        designTheme: r["design_theme"],
        imageFit: r["image_fit"],
        imageBrightness: r["image_brightness"],
        imageContrast: r["image_contrast"],
        imageSaturation: r["image_saturation"],
        imageSharpen: r["image_sharpen"],
        motionEnabled: r["motion_enabled"],
        motionSpeed: r["motion_speed"],
        motionDirection: r["motion_direction"],
      });
      break;
    case "navigation":
      a.navigationSettingsSchema.parse({
        items: r["navigation_items"],
        navStyle: r["nav_style"],
        mobileNavStyle: r["mobile_nav_style"],
      });
      break;
    case "features":
      a.featureFlagsSchema.parse(r["feature_flags"]);
      break;
    case "contact_info":
      (await import("./contact-info")).contactInfoSchema.parse(r["contact_info"]);
      break;
    case "categories":
      a.categoriesSchema.parse({ categories: r["categories"], categoriesEn: r["categories_en"] });
      break;
    case "customize": {
      const { saveThemeCustomizationSchema } = await import("./theme-customization");
      const map = r["theme_customizations"];
      if (!map || typeof map !== "object" || Array.isArray(map))
        throw new Error("Invalid customizations");
      for (const [theme, value] of Object.entries(map))
        saveThemeCustomizationSchema.parse({ theme, value });
      break;
    }
    case "terms": {
      const { termsSchema } = await import("./terms");
      termsSchema.parse(r["terms_content"]);
      break;
    }
    case "archy":
      (await import("./archy-settings")).archyGreetingSchema.parse(r["archy_greeting"]);
      break;
    case "notifications":
      (await import("./contact-settings.functions")).contactSettingsSchema.parse({
        recipientEmail: r["recipient_email"],
        notifyEnabled: r["notify_enabled"],
        autoReplyEnabled: r["auto_reply_enabled"],
        autoReplyText: r["auto_reply_text"],
      });
      break;
    case "ai": {
      const { aiConfigSchema } = await import("./ai-settings.functions");
      aiConfigSchema.parse({
        baseUrl: r["base_url"],
        model: r["model"],
        speed: r["speed"],
        apiKey: "",
        removeKey: false,
      });
      break;
    }
    default:
      throw new Error("Unsupported settings section");
  }
  return r;
}
