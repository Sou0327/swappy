-- Support tickets MVP

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets" ON public.support_tickets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users create own tickets" ON public.support_tickets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage tickets" ON public.support_tickets FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

