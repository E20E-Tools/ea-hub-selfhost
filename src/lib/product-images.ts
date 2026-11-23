import archone from "@/assets/archone-product.jpg";
import innovation from "@/assets/innovation-product.jpg";
import itfm from "@/assets/itfm-product.jpg";
import landscape from "@/assets/landscape-product.jpg";
import platform from "@/assets/platform-product.jpg";
import radar from "@/assets/radar-product.jpg";

export const productImages: Record<string, { src: string; alt: string }> = {
  archone: { src: archone, alt: "تصور توضيحي لطبقات البنية المؤسسية في ArchONE" },
  innovation: {
    src: innovation,
    alt: "تصور توضيحي لمسار الأفكار من الجمع إلى التقييم في Innovation",
  },
  itfm: { src: itfm, alt: "تصور توضيحي لتوزيع تكاليف التقنية على الخدمات في ITFM" },
  landscape: { src: landscape, alt: "تصور توضيحي لخريطة التطبيقات وعلاقاتها في Landscape" },
  platform: { src: platform, alt: "تصور توضيحي لتكامل أدوات البنية المؤسسية في EA Tool" },
  radar: { src: radar, alt: "تصور توضيحي لرادار تقييم التقنيات في Tech Radar" },
};
