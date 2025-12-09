-- 1. ضع بريدك الإلكتروني هنا بدلاً من 'YOUR_EMAIL'
-- Example: 'admin@factory.com'
UPDATE public.profiles
SET role = 'admin'
FROM auth.users
WHERE public.profiles.id = auth.users.id
AND auth.users.email = 'YOUR_EMAIL';

-- 2. للتأكد من نجاح العملية، قم بتشغيل هذا الاستعلام لرؤية صلاحيتك الحالية:
SELECT auth.users.email, public.profiles.role 
FROM public.profiles
JOIN auth.users ON public.profiles.id = auth.users.id
WHERE auth.users.email = 'YOUR_EMAIL';
