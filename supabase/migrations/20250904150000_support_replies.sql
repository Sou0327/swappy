-- Support replies for ticket threads

CREATE TABLE IF NOT EXISTS public.support_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_replies ENABLE ROW LEVEL SECURITY;

-- Users can read replies of their own tickets; admins can read all
CREATE POLICY "Users read own ticket replies" ON public.support_replies FOR SELECT
  TO authenticated USING (
    has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = support_replies.ticket_id AND st.user_id = auth.uid()
    )
  );

-- Users can add replies to their tickets; admins can reply anywhere
CREATE POLICY "Users add replies" ON public.support_replies FOR INSERT
  TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = support_replies.ticket_id AND st.user_id = auth.uid()
    )
  );

