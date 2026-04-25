# مترجم الكتب الذكي (Book Translator AI)

تطبيق ويب متقدم لترجمة الملفات باستخدام نماذج اللغة الكبيرة (LLMs) مع واجهة مستخدم داكنة أنيقة ومتجاوبة مع الهاتف المحمول.

## الميزات الرئيسية

### 📤 رفع الملفات المتقدم
- دعم صيغ متعددة: **EPUB**, **DOCX**, **TXT**, **SRT**
- ميزة السحب والإفلات (Drag & Drop)
- معالجة ذكية للملفات
- التحقق من صحة الملفات

> **الصيغ المدعومة:**
> - **SRT**: دعم كامل مع الحفاظ على التوقيتات ✅
> - **TXT**: دعم كامل مع الحفاظ على الفقرات ✅
> - **EPUB/DOCX**: استخراج النصوص (معالجة مبسطة) ⚠️

### 🌐 دعم اللغات الشامل
- أكثر من **30 لغة** مدعومة
- دعم كامل للغة **العربية**
- اختيار سهل للغة المصدر والهدف
- تحسين الترجمة بناءً على السياق

### 🤖 ترجمة ذكية بـ LLM
- استخدام نماذج لغة متقدمة للترجمة
- تقسيم ذكي للنصوص (Smart Chunking)
- الحفاظ على السياق والمعنى
- معالجة متسلسلة آمنة للأجزاء

> **ملاحظة الأداء**: المعالجة حالياً متسلسلة (chunk-by-chunk). للمعالجة المتوازية المحسّنة، يتطلب تحسينات إضافية في الإنتاج.

### 📊 شريط تقدم ديناميكي
- عرض نسبة الترجمة المنجزة
- عرض عدد الأجزاء المعالجة
- تحديث فوري للحالة
- معالجة الأخطاء والاستثناءات

### 💾 الحفاظ على التنسيق
- **SRT**: ✅ الحفاظ على التوقيتات والفواصل
- **TXT**: ✅ الحفاظ على هيكل الفقرات
- **EPUB**: ⚠️ معالجة مبسطة (استخراج النصوص)
- **DOCX**: ⚠️ معالجة مبسطة (استخراج النصوص)

> **ملاحظة**: معالجات EPUB و DOCX حالياً مبسطة وتستخرج النصوص فقط. للحصول على الحفاظ الكامل على التنسيق، يتطلب استخدام مكتبات متقدمة في الإنتاج.

### 📥 تنزيل الملفات المترجمة
- تنزيل مباشر بعد اكتمال الترجمة
- الملفات بنفس صيغة الملف الأصلي
- جودة عالية مع الحفاظ على التنسيق

### 📋 سجل الترجمات
- عرض جميع الترجمات السابقة
- بحث وتصفية متقدمة
- إحصائيات الترجمات
- إعادة تنزيل الملفات المترجمة
- حذف الترجمات القديمة

### 📱 تصميم متجاوب
- واجهة محسّنة للهاتف المحمول
- تصميم داكن أنيق
- سهولة الاستخدام على جميع الأجهزة
- أداء عالي وسرعة سريعة

## البدء السريع

### المتطلبات
- Node.js 22+
- pnpm (مدير الحزم)
- قاعدة بيانات MySQL/TiDB

### التثبيت

```bash
# استنساخ المشروع
git clone <repository-url>
cd translate-books-app

# تثبيت الحزم
pnpm install

# إعداد قاعدة البيانات
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# تشغيل خادم التطوير
pnpm dev
```

### الوصول
- افتح المتصفح على: `http://localhost:3000`
- سجل الدخول باستخدام حسابك

## الاستخدام

### ترجمة ملف جديد

1. **اختر ملفك:**
   - اسحب وأفلت الملف على منطقة الرفع
   - أو انقر لاختيار ملف من جهازك

2. **اختر اللغات:**
   - اختر لغة المصدر (اللغة الأصلية)
   - اختر لغة الهدف (اللغة المطلوبة)

3. **ابدأ الترجمة:**
   - انقر على زر "ابدأ الترجمة"
   - شاهد شريط التقدم

4. **حمّل الملف:**
   - بعد اكتمال الترجمة، انقر على "تنزيل"
   - سيتم حفظ الملف على جهازك

### إدارة السجل

1. **عرض السجل:**
   - انقر على "سجل الترجمات" من القائمة الرئيسية

2. **البحث والتصفية:**
   - استخدم شريط البحث للبحث عن اللغات
   - استخدم الأزرار للتصفية حسب الحالة

3. **إعادة التنزيل:**
   - اختر ترجمة مكتملة
   - انقر على زر التنزيل

4. **حذف الترجمات:**
   - اختر ترجمة
   - انقر على زر الحذف وأكد الحذف

## الصيغ المدعومة

### SRT (Subtitle)
- استخراج النصوص مع التوقيتات
- الحفاظ على تنسيق SRT الأصلي
- دعم ترجمة الترجمات

### TXT (Text)
- ملفات نصية عادية
- الحفاظ على هيكل الفقرات
- دعم الترجمة الكاملة

### EPUB (E-Book)
- ملفات الكتب الإلكترونية
- استخراج محتوى الكتاب
- الحفاظ على بنية الفصول

### DOCX (Word Document)
- ملفات مايكروسوفت وورد
- استخراج النصوص
- الحفاظ على التنسيق الأساسي

## البنية التقنية

### Frontend (React 19)
- **Framework**: React 19 مع Vite
- **Styling**: Tailwind CSS 4 مع OKLCH colors
- **UI Components**: shadcn/ui
- **State Management**: TanStack React Query
- **RPC**: tRPC 11

### Backend (Express 4)
- **Framework**: Express 4
- **Database**: Drizzle ORM مع MySQL
- **API**: tRPC procedures
- **Authentication**: Manus OAuth
- **LLM**: Manus Built-in LLM API

### Database Schema
```sql
-- جدول الملفات المرفوعة
CREATE TABLE uploaded_files (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  fileName VARCHAR(255),
  fileType VARCHAR(50),
  fileSize INT,
  fileKey VARCHAR(255),
  fileUrl VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول الترجمات
CREATE TABLE translations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  uploadedFileId INT,
  sourceLanguage VARCHAR(50),
  targetLanguage VARCHAR(50),
  status ENUM('pending', 'processing', 'completed', 'failed'),
  progress FLOAT DEFAULT 0,
  totalChunks INT DEFAULT 0,
  processedChunks INT DEFAULT 0,
  translatedFileUrl VARCHAR(255),
  translatedFileKey VARCHAR(255),
  errorMessage TEXT,
  completedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## المتغيرات البيئية

```env
# قاعدة البيانات
DATABASE_URL=mysql://user:password@host:3306/database

# المصادقة
JWT_SECRET=your-secret-key
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# تطبيق Manus
VITE_APP_ID=your-app-id
OWNER_OPEN_ID=your-owner-id
OWNER_NAME=Your Name

# واجهات API
BUILT_IN_FORGE_API_URL=https://forge.manus.im
BUILT_IN_FORGE_API_KEY=your-api-key
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.im
VITE_FRONTEND_FORGE_API_KEY=your-frontend-key

# التحليلات
VITE_ANALYTICS_ENDPOINT=https://analytics.manus.im
VITE_ANALYTICS_WEBSITE_ID=your-website-id
```

## الاختبار

```bash
# تشغيل الاختبارات
pnpm test

# تشغيل الاختبارات مع المراقبة
pnpm test --watch

# تشغيل اختبار محدد
pnpm test translation.test.ts
```

## النشر

### بناء الإنتاج
```bash
pnpm build
```

### تشغيل الإنتاج
```bash
pnpm start
```

### النشر على Manus
1. انقر على زر "Publish" في لوحة التحكم
2. اختر الإصدار المطلوب
3. انتظر اكتمال النشر

## استكشاف الأخطاء

### الترجمة بطيئة
- تحقق من حجم الملف
- تأكد من اتصال الإنترنت
- جرب ملف أصغر أولاً

### الملف لم يتم تنزيله
- تأكد من اكتمال الترجمة (100%)
- جرب متصفح مختلف
- امسح ذاكرة التخزين المؤقتة

### خطأ في الترجمة
- تحقق من صيغة الملف
- جرب لغة مختلفة
- تواصل مع الدعم الفني

## المساهمة

نرحب بالمساهمات! يرجى:
1. عمل fork للمشروع
2. إنشاء فرع للميزة الجديدة
3. إرسال pull request

## الترخيص

هذا المشروع مرخص تحت MIT License

## الدعم

للمساعدة والدعم:
- 📧 البريد الإلكتروني: support@example.com
- 🐛 الإبلاغ عن الأخطاء: GitHub Issues
- 💬 المناقشات: GitHub Discussions

## الخارطة الطريقية

- [ ] دعم صيغ إضافية (PDF, HTML)
- [ ] معالجة غير متزامنة محسّنة
- [ ] واجهة مسؤول متقدمة
- [ ] إحصائيات وتحليلات مفصلة
- [ ] API عام للمطورين
- [ ] تطبيق جوال أصلي

---

**آخر تحديث:** أبريل 2026
**الإصدار:** 1.0.0
