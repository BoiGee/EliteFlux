-- Every new account now starts with a 7-day full-Elite trial instead of a
-- permanent free tier. No further app-code changes needed for this: both
-- get_user_tier() and the app's resolveCaller() already treat status
-- 'trialing' as active as long as current_period_end is in the future, and
-- the existing expire-subs background job already downgrades any expired
-- 'trialing' row to tier='free', status='expired' on schedule — the same
-- path it already uses for lapsed paid subscriptions.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wl_id UUID;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;

  INSERT INTO public.subscriptions (user_id, tier, status, current_period_start, current_period_end)
  VALUES (NEW.id, 'elite', 'trialing', now(), now() + interval '7 days')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.watchlists (user_id, name, is_default) VALUES (NEW.id, 'My Watchlist', true) RETURNING id INTO wl_id;
  -- seed with BTC + ETH
  INSERT INTO public.watchlist_items (watchlist_id, user_id, symbol, coin_name)
  VALUES (wl_id, NEW.id, 'BTC', 'Bitcoin'), (wl_id, NEW.id, 'ETH', 'Ethereum');

  RETURN NEW;
END $$;
