-- Fill the missing catalogue details for the two newest products (ITFM and Innovation).
-- Both rows were created from the admin console with placeholder text only; this writes the
-- real Arabic label, description, overview, feature list and search keywords for each.
UPDATE public.products
SET category = 'technology',
    label = 'إدارة تكاليف التقنية',
    description = 'تتبّع تكاليف التقنية وربطها بالخدمات والقرارات.',
    overview = 'ITFM يوضّح أين تُصرف ميزانية التقنية: تكلفة كل خدمة وتطبيق ومورد، وتوزيعها على الإدارات، فتُبنى قرارات الترشيد والتطوير على أرقام واضحة بدل تقديرات عامة.',
    features = ARRAY[
      'تجميع تكاليف البنية والسحابة والتراخيص في مكان واحد',
      'توزيع التكلفة على الإدارات والخدمات',
      'ربط كل تكلفة بالتطبيق أو الخدمة التي أنتجتها',
      'تتبّع الالتزامات التعاقدية والتجديدات القادمة',
      'تحليل الانحراف بين الميزانية المعتمدة والصرف الفعلي',
      'تقارير تكلفة جاهزة للإدارة وللمالية'
    ]::text[],
    keywords = 'تكاليف ميزانية تقنية مالية ترشيد cost financial budget itfm',
    image_alt = 'تصور توضيحي لتوزيع تكاليف التقنية على الخدمات في ITFM'
WHERE id = 'itfm';

UPDATE public.products
SET category = 'technology',
    label = 'إدارة الابتكار',
    description = 'جمع الأفكار وتقييمها ومتابعة تحويلها إلى مبادرات.',
    overview = 'Innovation يحوّل الأفكار المتفرقة إلى مسار واحد: تُجمع الأفكار من كل الإدارات، وتُقيَّم بمعايير واحدة، ثم تُتابع مبادراتها من الفكرة حتى التشغيل مع أثرها المقاس.',
    features = ARRAY[
      'صندوق أفكار موحّد لكل الإدارات',
      'تقييم الأفكار بمعايير الأثر والجهد والجدوى',
      'جلسات مراجعة بتعليقات وقرارات موثّقة',
      'تحويل الأفكار المقبولة إلى مبادرات متابعة',
      'قياس الأثر بعد التشغيل',
      'لوحة حالة للبرامج والمبادرات الجارية'
    ]::text[],
    keywords = 'أفكار مبادرات ابتكار تقييم أثر ideas innovation',
    image_alt = 'تصور توضيحي لمسار الأفكار من الجمع إلى التقييم في Innovation'
WHERE id = 'innovation';