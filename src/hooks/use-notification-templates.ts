import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncState } from './use-async-state';
import { useErrorHandler } from './use-error-handler';

export interface NotificationTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  title_template: string;
  message_template: string;
  notification_type: string;
  variables: string[];
  active: boolean;
  manual_send_allowed: boolean;
  created_at: string;
  updated_at: string;
}

interface NotificationTemplateRow {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  title_template: string;
  message_template: string;
  notification_type: string;
  variables: unknown;
  active: boolean;
  manual_send_allowed: boolean;
  created_at: string;
  updated_at: string;
}

export const useNotificationTemplates = () => {
  const { handleError } = useErrorHandler();
  const templatesState = useAsyncState<NotificationTemplate[]>();

  const loadTemplates = useCallback(async (): Promise<NotificationTemplate[]> => {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('active', true)
      .eq('manual_send_allowed', true)
      .order('name');

    if (error) throw error;

    return (data as unknown as NotificationTemplateRow[]).map((item: NotificationTemplateRow) => ({
      id: item.id,
      template_key: item.template_key,
      name: item.name,
      description: item.description,
      title_template: item.title_template,
      message_template: item.message_template,
      notification_type: item.notification_type,
      variables: Array.isArray(item.variables) ? item.variables as string[] : [],
      active: item.active,
      manual_send_allowed: item.manual_send_allowed,
      created_at: item.created_at,
      updated_at: item.updated_at
    }));
  }, []);

  const refresh = useCallback(() => {
    templatesState.execute(() => loadTemplates());
  }, [loadTemplates, templatesState]);

  return {
    templates: templatesState.data,
    loading: templatesState.loading,
    error: templatesState.error,
    refresh
  };
};
