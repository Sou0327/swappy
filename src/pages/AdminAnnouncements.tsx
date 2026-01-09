import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { supabase } from '../integrations/supabase/client';
import { Loader2, Plus, Edit, Trash2, Send, Eye, Calendar, AlertTriangle, Megaphone, X, History, User } from 'lucide-react';
import { toast } from 'sonner';
import { useNotificationSendHistory } from '../hooks/use-notification-send-history';

/*
  お知らせ・通知管理画面

  機能:
  - お知らせの作成/編集/削除
  - 公開/非公開の切り替え
  - プレビュー機能
  - 一斉通知送信

  対象ユーザー: Admin/Moderator権限
*/

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'maintenance' | 'feature' | 'warning' | 'info' | 'event';
  importance: 'low' | 'normal' | 'high' | 'critical';
  published: boolean;
  publish_at: string | null;
  expire_at: string | null;
  target_user_role: 'all' | 'user' | 'moderator' | 'admin';
  created_at: string;
  updated_at: string;
}

interface NotificationTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string;
  title_template: string;
  message_template: string;
  notification_type: string;
  variables: string[];
  active: boolean;
  manual_send_allowed: boolean;
}

// デフォルト（システム）テンプレートのキー一覧
// 全てのデフォルトテンプレートが削除されたため、空の配列
const SYSTEM_TEMPLATE_KEYS: string[] = [];

// ====================================
// API Functions
// ====================================

async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function fetchNotificationTemplates(): Promise<NotificationTemplate[]> {
  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('active', true)
    .eq('manual_send_allowed', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

// 管理画面用：すべてのテンプレートを取得（manual_send_allowedに関係なく）
async function fetchAllTemplates(): Promise<NotificationTemplate[]> {
  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function createTemplate(template: Omit<NotificationTemplate, 'id'>) {
  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      template_key: template.template_key,
      name: template.name,
      description: template.description,
      title_template: template.title_template,
      message_template: template.message_template,
      notification_type: template.notification_type,
      variables: template.variables,
      active: template.active,
      manual_send_allowed: template.manual_send_allowed
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateTemplate(id: string, updates: Partial<NotificationTemplate>) {
  const { data, error } = await supabase
    .from('notification_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteTemplate(id: string) {
  const { error } = await supabase
    .from('notification_templates')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

async function createAnnouncement(announcement: Omit<Announcement, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('announcements')
    .insert(announcement)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateAnnouncement(id: string, updates: Partial<Announcement>) {
  const { data, error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteAnnouncement(id: string) {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

async function sendNotification(params: {
  template_key?: string;
  template_variables?: Record<string, string | number>;
  title?: string;
  message?: string;
  type?: string;
  category?: string;
  broadcast?: boolean;
  target_role?: 'all' | 'user' | 'moderator' | 'admin';
  user_ids?: string[];
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('認証が必要です');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notification-sender`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to send notification');
  }

  const result = await response.json();
  return result;
}

// ====================================
// Utility Functions
// ====================================

// ISO 8601形式（UTC）をdatetime-local形式（YYYY-MM-DDTHH:mm）に変換
const formatDatetimeLocal = (isoString: string | null): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  // ローカルタイムゾーンでのYYYY-MM-DDTHH:mm形式
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// datetime-local形式（YYYY-MM-DDTHH:mm）をISO 8601形式（UTC）に変換
const convertDatetimeLocalToISO = (datetimeLocal: string | null): string | null => {
  if (!datetimeLocal) return null;
  // datetime-local形式はローカルタイムゾーンを想定
  const date = new Date(datetimeLocal);
  return date.toISOString();
};

// ====================================
// Category/Importance Labels
// ====================================

const categoryLabels = {
  maintenance: 'メンテナンス',
  feature: '新機能',
  warning: '警告',
  info: '情報',
  event: 'イベント'
};

const importanceLabels = {
  normal: '通常',
  high: '重要'
};

const roleLabels = {
  all: '全ユーザー',
  user: '一般ユーザー',
  moderator: 'モデレーター',
  admin: '管理者'
};

// ====================================
// Main Component
// ====================================

export default function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSendNotificationDialogOpen, setIsSendNotificationDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [previewAnnouncement, setPreviewAnnouncement] = useState<Announcement | null>(null);

  // テンプレート選択用の状態
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);

  // 個別送信用の状態
  const [sendMode, setSendMode] = useState<'broadcast' | 'individual'>('broadcast');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<Array<{ id: string; email: string; user_handle: string | null }>>([]);
  const [selectedUsers, setSelectedUsers] = useState<Array<{id: string, email: string, user_handle: string | null}>>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Form state for create/edit
  const [formData, setFormData] = useState<Partial<Announcement>>({
    title: '',
    content: '',
    category: 'info',
    importance: 'normal',
    target_user_role: 'all',
    published: false,
    publish_at: null,
    expire_at: null
  });

  // Notification form state
  const [notificationFormData, setNotificationFormData] = useState({
    title: '',
    message: '',
    type: 'info',
    category: 'system',
    broadcast: true,
    target_role: 'all' as 'all' | 'user' | 'moderator' | 'admin',
    template_key: '',
    template_variables: {}
  });

  // テンプレート管理用の状態
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [templateFormData, setTemplateFormData] = useState({
    template_key: '',
    name: '',
    description: '',
    title_template: '',
    message_template: '',
    notification_type: 'info',
    variables: [] as string[],
    active: true
    // manual_send_allowed は常にtrue（管理画面から作成するテンプレートは全て手動送信用）
  });

  // Queries
  const { data: announcements = [], isLoading: announcementsLoading } = useQuery<Announcement[]>({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    refetchInterval: 30000
  });

  // 管理画面用：すべてのテンプレートを取得
  const { data: allTemplates = [], isLoading: templatesLoading } = useQuery<NotificationTemplate[]>({
    queryKey: ['allNotificationTemplates'],
    queryFn: fetchAllTemplates
  });

  // 通知送信用：manual_send_allowedなテンプレートのみ
  const { data: templates = [], isLoading: sendableTemplatesLoading } = useQuery<NotificationTemplate[]>({
    queryKey: ['notificationTemplates'],
    queryFn: fetchNotificationTemplates
  });

  // 送信履歴取得
  const { history: sendHistory, loading: sendHistoryLoading, loadWithFilters } = useNotificationSendHistory();

  // Mutations
  const createMutation = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: async (newAnnouncement) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('お知らせを作成しました');

      // 公開されている場合のみ通知を送信
      if (newAnnouncement.published) {
        try {
          await sendNotification({
            broadcast: true,
            target_role: newAnnouncement.target_user_role,
            title: newAnnouncement.title,
            message: newAnnouncement.content.substring(0, 100),
            type: 'info',
            category: 'announcement'
          });
          toast.success('通知を送信しました');
        } catch (error) {
          console.error('通知送信エラー:', error);
          toast.error('通知の送信に失敗しました');
        }
      }

      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`作成エラー: ${error.message}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Announcement> }) =>
      updateAnnouncement(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('お知らせを更新しました');
      setIsEditDialogOpen(false);
      setSelectedAnnouncement(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`更新エラー: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('お知らせを削除しました');
    },
    onError: (error: Error) => {
      toast.error(`削除エラー: ${error.message}`);
    }
  });

  const sendNotificationMutation = useMutation({
    mutationFn: sendNotification,
    onSuccess: (result) => {
      toast.success(`${result.notifications_sent}件の通知を送信しました`);
      setIsSendNotificationDialogOpen(false);
      resetNotificationForm();
    },
    onError: (error: Error) => {
      toast.error(`通知送信エラー: ${error.message}`);
    }
  });

  // テンプレート管理用のミューテーション
  const createTemplateMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allNotificationTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['notificationTemplates'] });
      toast.success('テンプレートを作成しました');
      setIsTemplateDialogOpen(false);
      resetTemplateForm();
    },
    onError: (error: Error) => {
      toast.error(`作成エラー: ${error.message}`);
    }
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<NotificationTemplate> }) =>
      updateTemplate(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allNotificationTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['notificationTemplates'] });
      toast.success('テンプレートを更新しました');
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
      resetTemplateForm();
    },
    onError: (error: Error) => {
      toast.error(`更新エラー: ${error.message}`);
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allNotificationTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['notificationTemplates'] });
      toast.success('テンプレートを削除しました');
    },
    onError: (error: Error) => {
      toast.error(`削除エラー: ${error.message}`);
    }
  });

  // ====================================
  // UI Handlers
  // ====================================

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      category: 'info',
      importance: 'normal',
      target_user_role: 'all',
      published: false,
      publish_at: null,
      expire_at: null
    });
  };

  const resetNotificationForm = () => {
    setNotificationFormData({
      title: '',
      message: '',
      type: 'info',
      category: 'system',
      broadcast: true,
      target_role: 'all',
      template_key: '',
      template_variables: {}
    });
    setUseTemplate(false);
    setSelectedTemplate(null);
    setSendMode('broadcast');
    setUserSearchQuery('');
    setSearchedUsers([]);
    setSelectedUserIds([]);
  };

  const resetTemplateForm = () => {
    setTemplateFormData({
      template_key: '',
      name: '',
      description: '',
      title_template: '',
      message_template: '',
      notification_type: 'info',
      variables: [],
      active: true
      // manual_send_allowed は送信時に自動でtrueに設定
    });
  };

  const handleOpenTemplateDialog = () => {
    resetTemplateForm();
    setEditingTemplate(null);
    setIsTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setTemplateFormData({
      template_key: template.template_key,
      name: template.name,
      description: template.description || '',
      title_template: template.title_template,
      message_template: template.message_template,
      notification_type: template.notification_type,
      variables: template.variables,
      active: template.active
      // manual_send_allowed は常にtrueなので編集不可
    });
    setIsTemplateDialogOpen(true);
  };

  const handleDeleteTemplate = (templateId: string, templateKey: string) => {
    if (SYSTEM_TEMPLATE_KEYS.includes(templateKey)) {
      toast.error('システムテンプレートは削除できません');
      return;
    }

    if (window.confirm('このテンプレートを削除してもよろしいですか？')) {
      deleteTemplateMutation.mutate(templateId);
    }
  };

  const handleSubmitTemplate = () => {
    // バリデーション
    if (!templateFormData.template_key.trim()) {
      toast.error('テンプレートキーを入力してください');
      return;
    }
    if (!templateFormData.name.trim()) {
      toast.error('テンプレート名を入力してください');
      return;
    }
    if (!templateFormData.title_template.trim()) {
      toast.error('タイトルテンプレートを入力してください');
      return;
    }
    if (!templateFormData.message_template.trim()) {
      toast.error('メッセージテンプレートを入力してください');
      return;
    }

    if (editingTemplate) {
      // 編集モード
      if (SYSTEM_TEMPLATE_KEYS.includes(editingTemplate.template_key)) {
        toast.error('システムテンプレートは編集できません');
        return;
      }
      updateTemplateMutation.mutate({
        id: editingTemplate.id,
        updates: {
          ...templateFormData,
          manual_send_allowed: true  // 管理画面から作成したテンプレートは常に手動送信可能
        }
      });
    } else {
      // 新規作成モード
      createTemplateMutation.mutate({
        ...templateFormData,
        manual_send_allowed: true  // 管理画面から作成したテンプレートは常に手動送信可能
      } as Omit<NotificationTemplate, 'id'>);
    }
  };

  const handleAddVariable = () => {
    setTemplateFormData({
      ...templateFormData,
      variables: [...templateFormData.variables, '']
    });
  };

  const handleRemoveVariable = (index: number) => {
    const newVariables = templateFormData.variables.filter((_, i) => i !== index);
    setTemplateFormData({
      ...templateFormData,
      variables: newVariables
    });
  };

  const handleVariableChange = (index: number, value: string) => {
    const newVariables = [...templateFormData.variables];
    newVariables[index] = value;
    setTemplateFormData({
      ...templateFormData,
      variables: newVariables
    });
  };

  const handleTemplateSelect = (templateKey: string) => {
    const template = templates.find(t => t.template_key === templateKey);
    if (!template) return;

    setSelectedTemplate(template);

    // 変数入力フィールドを初期化
    const variables: Record<string, string> = {};
    template.variables.forEach(varName => {
      variables[varName] = '';
    });

    setNotificationFormData({
      ...notificationFormData,
      template_key: templateKey,
      template_variables: variables,
      title: '', // テンプレート使用時はtitle/messageを空にする
      message: ''
    });
  };

  const handleTemplateVariableChange = (varName: string, value: string) => {
    setNotificationFormData({
      ...notificationFormData,
      template_variables: {
        ...notificationFormData.template_variables,
        [varName]: value
      }
    });
  };

  const handleUserSearch = async () => {
    if (!userSearchQuery.trim()) {
      setSearchedUsers([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, user_handle')
        .or(`email.ilike.%${userSearchQuery}%,user_handle.ilike.%${userSearchQuery}%`)
        .limit(10);

      if (error) throw error;
      setSearchedUsers(data || []);
    } catch (error) {
      console.error('ユーザー検索エラー:', error);
      toast.error('ユーザー検索に失敗しました');
      setSearchedUsers([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUserSelect = (userId: string) => {
    if (selectedUsers.some(u => u.id === userId)) {
      setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
    } else {
      const user = searchedUsers.find(u => u.id === userId);
      if (user) {
        setSelectedUsers([...selectedUsers, { id: user.id, email: user.email, user_handle: user.user_handle }]);
      }
    }
  };

  const handleRemoveSelectedUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
  };

  const handleCreate = () => {
    if (!formData.title || !formData.content) {
      toast.error('タイトルと内容は必須です');
      return;
    }
    // datetime-local形式をISO 8601形式に変換してから送信
    const dataToSubmit = {
      ...formData,
      publish_at: convertDatetimeLocalToISO(formData.publish_at),
      expire_at: convertDatetimeLocalToISO(formData.expire_at)
    };
    createMutation.mutate(dataToSubmit as Omit<Announcement, 'id' | 'created_at' | 'updated_at'>);
  };

  const handleEdit = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setFormData({
      ...announcement,
      publish_at: formatDatetimeLocal(announcement.publish_at),
      expire_at: formatDatetimeLocal(announcement.expire_at)
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedAnnouncement) return;
    if (!formData.title || !formData.content) {
      toast.error('タイトルと内容は必須です');
      return;
    }
    // datetime-local形式をISO 8601形式に変換してから送信
    const dataToSubmit = {
      ...formData,
      publish_at: convertDatetimeLocalToISO(formData.publish_at),
      expire_at: convertDatetimeLocalToISO(formData.expire_at)
    };
    updateMutation.mutate({
      id: selectedAnnouncement.id,
      updates: dataToSubmit
    });
  };

  const handleTogglePublish = (announcement: Announcement) => {
    updateMutation.mutate({
      id: announcement.id,
      updates: { published: !announcement.published }
    });
  };

  const handleSendNotification = () => {
    // 送信モード別のバリデーション
    if (sendMode === 'individual') {
      if (selectedUsers.length === 0) {
        toast.error('送信先ユーザーを選択してください');
        return;
      }
    }

    // テンプレート使用時のバリデーション
    if (useTemplate) {
      if (!notificationFormData.template_key) {
        toast.error('テンプレートを選択してください');
        return;
      }
      // 必須変数のチェック（すべての変数が入力されているか）
      if (selectedTemplate) {
        const missingVars = selectedTemplate.variables.filter(
          varName => !notificationFormData.template_variables[varName]
        );
        if (missingVars.length > 0) {
          toast.error(`必須項目を入力してください: ${missingVars.join(', ')}`);
          return;
        }
      }
    } else {
      // 直接入力時のバリデーション
      if (!notificationFormData.title || !notificationFormData.message) {
        toast.error('タイトルとメッセージは必須です');
        return;
      }
    }

    // 送信データの作成
    const sendData = {
      ...notificationFormData,
      broadcast: sendMode === 'broadcast',
      user_ids: sendMode === 'individual' ? selectedUsers.map(u => u.id) : undefined
    };

    sendNotificationMutation.mutate(sendData);
  };

  const getImportanceBadgeVariant = (importance: string) => {
    // 重要度が「重要」の時のみBadgeを表示
    if (importance === 'high') {
      return 'destructive';
    }
    return null; // 通常の場合はBadge非表示
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="mb-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold mb-1">お知らせ・通知管理</h1>
            <p className="text-sm text-muted-foreground">
              プラットフォーム全体へのお知らせと通知を管理します
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Dialog open={isSendNotificationDialogOpen} onOpenChange={setIsSendNotificationDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-8 text-sm px-4 flex-1 md:flex-none rounded-md">
                  <Send className="mr-2 h-4 w-4" />
                  通知送信
                </Button>
              </DialogTrigger>
              <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-2 rounded-md">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-base">一斉通知送信</DialogTitle>
                  <DialogDescription className="text-sm">
                    ユーザーに直接通知を送信します
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  {/* 送信モード選択 */}
                  <div>
                    <Label className="mb-2 block text-sm font-medium">送信モード</Label>
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="mode-broadcast"
                          name="sendMode"
                          checked={sendMode === 'broadcast'}
                          onChange={() => setSendMode('broadcast')}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="mode-broadcast" className="cursor-pointer text-sm">
                          一斉送信
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="mode-individual"
                          name="sendMode"
                          checked={sendMode === 'individual'}
                          onChange={() => setSendMode('individual')}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="mode-individual" className="cursor-pointer text-sm">
                          個別送信
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* 個別送信：ユーザー検索 */}
                  {sendMode === 'individual' && (
                    <div className="space-y-2 border rounded-md p-2 bg-muted/30 shadow-sm">
                      <Label className="text-sm font-medium">対象ユーザー検索</Label>
                      <div className="flex gap-2">
                        <Input
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="メールアドレスまたはユーザー名で検索"
                          className="text-sm h-8 rounded-md"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUserSearch();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleUserSearch}
                          disabled={isSearching}
                          className="h-8 text-sm px-4 rounded-md whitespace-nowrap"
                        >
                          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : '検索'}
                        </Button>
                      </div>

                      {/* 検索結果 */}
                      {searchedUsers.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">検索結果（クリックして選択）:</p>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {searchedUsers.map((user) => (
                              <div
                                key={user.id}
                                onClick={() => handleUserSelect(user.id)}
                                className={`p-2 rounded-md cursor-pointer transition-all duration-200 ${
                                  selectedUsers.some(u => u.id === user.id)
                                    ? 'bg-primary/20 border-2 border-primary shadow-sm'
                                    : 'bg-background hover:bg-muted border-2 border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedUsers.some(u => u.id === user.id)}
                                    onChange={() => {}}
                                    className="w-4 h-4"
                                  />
                                  <div className="flex-1 text-sm">
                                    <p className="font-medium">{user.email}</p>
                                    {user.user_handle && (
                                      <p className="text-muted-foreground">@{user.user_handle}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 選択済みユーザー */}
                      {selectedUsers.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">選択済み: {selectedUsers.length}名</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedUsers.map((user) => (
                              <Badge key={user.id} variant="secondary" className="gap-1 py-0.5 px-2 text-xs rounded-md">
                                {user.user_handle || user.email}
                                <button
                                  onClick={() => handleRemoveSelectedUser(user.id)}
                                  className="ml-1 hover:text-destructive transition-colors duration-200"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 一斉送信：対象ユーザーロール選択 */}
                  {sendMode === 'broadcast' && (
                    <div>
                      <Label htmlFor="notification-target" className="mb-2 block text-sm font-medium">対象ユーザー</Label>
                      <Select
                        value={notificationFormData.target_role}
                        onValueChange={(value: 'all' | 'user' | 'moderator' | 'admin') =>
                          setNotificationFormData({ ...notificationFormData, target_role: value })
                        }
                      >
                        <SelectTrigger className="text-sm h-8 rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-md">
                          {Object.entries(roleLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key} className="text-sm py-2">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* テンプレート使用切り替え */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="use-template"
                      checked={useTemplate}
                      onChange={(e) => {
                        setUseTemplate(e.target.checked);
                        if (!e.target.checked) {
                          setSelectedTemplate(null);
                          setNotificationFormData({
                            ...notificationFormData,
                            template_key: '',
                            template_variables: {}
                          });
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <Label htmlFor="use-template" className="cursor-pointer text-sm">
                      テンプレートを使用する
                    </Label>
                  </div>

                  {/* テンプレート選択 */}
                  {useTemplate && (
                    <div>
                      <Label htmlFor="template-select" className="mb-2 block text-sm font-medium">テンプレート選択</Label>
                      <Select
                        value={notificationFormData.template_key}
                        onValueChange={handleTemplateSelect}
                      >
                        <SelectTrigger className="text-sm h-8 rounded-md">
                          <SelectValue placeholder="テンプレートを選択してください" />
                        </SelectTrigger>
                        <SelectContent className="rounded-md">
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.template_key} className="text-sm py-2">
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedTemplate && selectedTemplate.description && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {selectedTemplate.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* テンプレート変数入力 */}
                  {useTemplate && selectedTemplate && selectedTemplate.variables.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">テンプレート変数</Label>
                      {selectedTemplate.variables.map((varName) => (
                        <div key={varName}>
                          <Label htmlFor={`var-${varName}`} className="mb-1.5 block text-sm">
                            {varName}
                          </Label>
                          <Input
                            id={`var-${varName}`}
                            value={notificationFormData.template_variables[varName] || ''}
                            onChange={(e) => handleTemplateVariableChange(varName, e.target.value)}
                            placeholder={`${varName}を入力`}
                            className="text-sm h-8 rounded-md"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* テンプレートプレビュー */}
                  {useTemplate && selectedTemplate && (
                    <div className="bg-muted p-2 rounded-md shadow-sm space-y-1">
                      <p className="text-sm font-medium">プレビュー</p>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">タイトル:</p>
                        <p className="text-sm font-medium">{selectedTemplate.title_template}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">メッセージ:</p>
                        <p className="text-sm">{selectedTemplate.message_template}</p>
                      </div>
                    </div>
                  )}

                  {/* 直接入力フィールド */}
                  {!useTemplate && (
                    <>
                      <div>
                        <Label htmlFor="notification-title" className="mb-1 block text-sm font-medium">タイトル</Label>
                        <Input
                          id="notification-title"
                          value={notificationFormData.title}
                          onChange={(e) => setNotificationFormData({ ...notificationFormData, title: e.target.value })}
                          placeholder="通知のタイトル"
                          className="text-sm h-8 rounded-md"
                        />
                      </div>
                      <div>
                        <Label htmlFor="notification-message" className="mb-1 block text-sm font-medium">メッセージ</Label>
                        <Textarea
                          id="notification-message"
                          value={notificationFormData.message}
                          onChange={(e) => setNotificationFormData({ ...notificationFormData, message: e.target.value })}
                          placeholder="通知のメッセージ"
                          rows={4}
                          className="text-sm py-1.5 min-h-[100px] rounded-md resize-none"
                        />
                      </div>
                    </>
                  )}

                  {/* 共通設定：通知タイプ */}
                  <div>
                    <Label htmlFor="notification-type" className="mb-1 block text-sm font-medium">通知タイプ</Label>
                    <Select
                      value={notificationFormData.type}
                      onValueChange={(value) => setNotificationFormData({ ...notificationFormData, type: value })}
                      disabled={useTemplate}
                    >
                      <SelectTrigger className="text-sm h-8 rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-md">
                        <SelectItem value="info" className="text-sm py-2">情報</SelectItem>
                        <SelectItem value="success" className="text-sm py-2">成功</SelectItem>
                        <SelectItem value="warning" className="text-sm py-2">警告</SelectItem>
                        <SelectItem value="error" className="text-sm py-2">エラー</SelectItem>
                        <SelectItem value="kyc" className="text-sm py-2">KYC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsSendNotificationDialogOpen(false)}
                    className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleSendNotification}
                    disabled={sendNotificationMutation.isPending}
                    className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
                  >
                    {sendNotificationMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    送信
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none">
                  <Plus className="mr-2 h-4 w-4" />
                  お知らせ作成
                </Button>
              </DialogTrigger>
              <DialogContent className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-2 rounded-md">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-base">新しいお知らせ</DialogTitle>
                  <DialogDescription className="text-sm">
                    プラットフォーム全体に表示されるお知らせを作成します
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="title" className="mb-1 block text-sm font-medium">タイトル</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="お知らせのタイトル"
                      className="text-sm h-8 rounded-md"
                    />
                  </div>
                  <div>
                    <Label htmlFor="content" className="mb-1 block text-sm font-medium">内容</Label>
                    <Textarea
                      id="content"
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="お知らせの本文"
                      rows={6}
                      className="text-sm py-1.5 min-h-[150px] rounded-md resize-none"
                    />
                  </div>
                  <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
                    <div>
                      <Label htmlFor="category" className="mb-1 block text-sm font-medium">カテゴリ</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value: 'maintenance' | 'feature' | 'warning' | 'info' | 'event') => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger className="text-sm h-8 rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-md">
                          {Object.entries(categoryLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key} className="text-sm py-2">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="importance" className="mb-1 block text-sm font-medium">重要度</Label>
                      <Select
                        value={formData.importance}
                        onValueChange={(value: 'low' | 'medium' | 'high') => setFormData({ ...formData, importance: value })}
                      >
                        <SelectTrigger className="text-sm h-8 rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-md">
                          {Object.entries(importanceLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key} className="text-sm py-2">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="target_role" className="mb-1 block text-sm font-medium">対象ユーザー</Label>
                      <Select
                        value={formData.target_user_role}
                        onValueChange={(value: 'all' | 'admin' | 'user' | 'kyc_verified' | 'kyc_pending') => setFormData({ ...formData, target_user_role: value })}
                      >
                        <SelectTrigger className="text-sm h-8 rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-md">
                          {Object.entries(roleLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key} className="text-sm py-2">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                    <div>
                      <Label htmlFor="publish_at" className="mb-1 block text-sm font-medium">公開日時 (オプション)</Label>
                      <Input
                        id="publish_at"
                        type="datetime-local"
                        value={formData.publish_at || ''}
                        onChange={(e) => setFormData({ ...formData, publish_at: e.target.value || null })}
                        className="text-sm h-8 rounded-md"
                      />
                    </div>
                    <div>
                      <Label htmlFor="expire_at" className="mb-1 block text-sm font-medium">終了日時 (オプション)</Label>
                      <Input
                        id="expire_at"
                        type="datetime-local"
                        value={formData.expire_at || ''}
                        onChange={(e) => setFormData({ ...formData, expire_at: e.target.value || null })}
                        className="text-sm h-8 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="published"
                      checked={formData.published}
                      onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="published" className="cursor-pointer text-sm">
                      すぐに公開する
                    </Label>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      resetForm();
                    }}
                    className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
                  >
                    {createMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    作成
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="announcements" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 md:inline-flex md:w-auto rounded-md p-1">
            <TabsTrigger value="announcements" className="text-sm py-2 rounded">お知らせ一覧</TabsTrigger>
            <TabsTrigger value="templates" className="text-sm py-2 rounded">通知テンプレート</TabsTrigger>
            <TabsTrigger value="history" className="text-sm py-2 rounded">送信履歴</TabsTrigger>
          </TabsList>

          {/* ====================================
              お知らせ一覧タブ
              ==================================== */}
          <TabsContent value="announcements" className="space-y-2">
            {announcementsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : announcements.length === 0 ? (
              <Card className="rounded-md shadow-sm">
                <CardContent className="py-4 text-center">
                  <Megaphone className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">お知らせはまだありません</p>
                  <Button
                    variant="outline"
                    className="h-8 text-sm px-4 rounded-md"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    最初のお知らせを作成
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {announcements.map((announcement) => (
                  <Card key={announcement.id} className="rounded-md shadow-sm">
                    <CardHeader className="p-2">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-0">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-1 mb-1">
                            <CardTitle className="text-base">{announcement.title}</CardTitle>
                            {getImportanceBadgeVariant(announcement.importance) && (
                              <Badge variant={getImportanceBadgeVariant(announcement.importance)} className="py-0.5 px-2 text-xs rounded-md">
                                {importanceLabels[announcement.importance]}
                              </Badge>
                            )}
                            <Badge variant="outline" className="py-0.5 px-2 text-xs rounded-md">
                              {categoryLabels[announcement.category]}
                            </Badge>
                            {announcement.published ? (
                              <Badge className="py-0.5 px-2 text-xs rounded-md">公開中</Badge>
                            ) : (
                              <Badge variant="secondary" className="py-0.5 px-2 text-xs rounded-md">非公開</Badge>
                            )}
                          </div>
                          <CardDescription className="text-sm">
                            対象: {roleLabels[announcement.target_user_role]} |
                            作成: {new Date(announcement.created_at).toLocaleDateString('ja-JP')}
                            {announcement.publish_at && ` | 公開予定: ${new Date(announcement.publish_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                            {announcement.expire_at && ` | 終了予定: ${new Date(announcement.expire_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap md:flex-nowrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewAnnouncement(announcement)}
                            className="h-8 px-3 rounded-md"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(announcement)}
                            className="h-8 px-3 rounded-md"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={announcement.published ? "secondary" : "default"}
                            size="sm"
                            onClick={() => handleTogglePublish(announcement)}
                            className="h-8 px-3 text-sm rounded-md whitespace-nowrap"
                          >
                            {announcement.published ? '非公開' : '公開'}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 px-3 rounded-md">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="w-full max-w-md p-2 rounded-md">
                              <AlertDialogHeader className="space-y-1">
                                <AlertDialogTitle className="text-base">お知らせを削除</AlertDialogTitle>
                                <AlertDialogDescription className="text-sm">
                                  この操作は取り消せません。本当に削除しますか？
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="gap-2">
                                <AlertDialogCancel className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none">キャンセル</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(announcement.id)}
                                  className="bg-destructive text-destructive-foreground h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
                                >
                                  削除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-2 pt-0">
                      <p className="whitespace-pre-wrap text-sm">{announcement.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ====================================
              通知テンプレートタブ
              ==================================== */}
          <TabsContent value="templates" className="space-y-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-0">
              <div>
                <h3 className="text-base font-semibold">通知テンプレート管理</h3>
                <p className="text-sm text-muted-foreground">カスタム通知テンプレートの作成・編集・削除ができます</p>
              </div>
              <Button onClick={handleOpenTemplateDialog} className="h-8 text-sm px-4 rounded-md w-full md:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                新規作成
              </Button>
            </div>

            {templatesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                {allTemplates.map((template) => {
                  const isSystemTemplate = SYSTEM_TEMPLATE_KEYS.includes(template.template_key);
                  return (
                    <Card key={template.id} className="rounded-md shadow-sm">
                      <CardHeader className="p-2">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-0">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-1 mb-1">
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              {isSystemTemplate && (
                                <Badge variant="secondary" className="text-xs py-0.5 px-2 rounded-md">
                                  システム
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="text-sm">{template.description}</CardDescription>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={template.active ? "default" : "secondary"} className="py-0.5 px-2 text-sm rounded-md">
                              {template.active ? 'アクティブ' : '非アクティブ'}
                            </Badge>
                            {template.manual_send_allowed && (
                              <Badge variant="outline" className="text-xs py-0.5 px-2 rounded-md">
                                手動送信可
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-1 p-2 pt-0">
                        <div>
                          <p className="text-sm font-medium mb-1">テンプレートキー</p>
                          <p className="text-sm text-muted-foreground font-mono">{template.template_key}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-1">タイトル</p>
                          <p className="text-sm text-muted-foreground">{template.title_template}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-1">メッセージ</p>
                          <p className="text-sm text-muted-foreground">{template.message_template}</p>
                        </div>
                        {template.variables.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-1">変数</p>
                            <div className="flex flex-wrap gap-1">
                              {template.variables.map((variable) => (
                                <Badge key={variable} variant="outline" className="text-xs py-0.5 px-2 rounded-md">
                                  {`{{${variable}}}`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {!isSystemTemplate && (
                          <div className="flex gap-1 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditTemplate(template)}
                              className="flex-1 h-8 text-sm rounded-md"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              編集
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteTemplate(template.id, template.template_key)}
                              className="flex-1 text-destructive hover:text-destructive h-8 text-sm rounded-md"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              削除
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ====================================
              送信履歴タブ
              ==================================== */}
          <TabsContent value="history" className="space-y-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-0">
              <div>
                <h3 className="text-base font-semibold">送信履歴</h3>
                <p className="text-sm text-muted-foreground">過去の通知送信履歴を確認できます</p>
              </div>
            </div>

            {sendHistoryLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !sendHistory || sendHistory.length === 0 ? (
              <Card className="rounded-md shadow-sm">
                <CardContent className="py-4 text-center">
                  <History className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">送信履歴はまだありません</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {sendHistory.map((record) => (
                  <Card key={record.id} className="rounded-md shadow-sm">
                    <CardHeader className="p-2">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-0">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-1 mb-1">
                            <CardTitle className="text-base">{record.title}</CardTitle>
                            <Badge
                              variant={
                                record.status === 'success' ? 'default' :
                                record.status === 'partial' ? 'secondary' :
                                'destructive'
                              }
                              className="py-0.5 px-2 text-xs rounded-md"
                            >
                              {record.status === 'success' ? '成功' :
                               record.status === 'partial' ? '一部失敗' :
                               '失敗'}
                            </Badge>
                            {record.isBroadcast && (
                              <Badge variant="outline" className="py-0.5 px-2 text-xs rounded-md">
                                一斉送信
                              </Badge>
                            )}
                            {record.templateKey && (
                              <Badge variant="outline" className="py-0.5 px-2 text-xs rounded-md">
                                {record.templateName || record.templateKey}
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-sm">
                            送信者: {record.sentByEmail || '不明'} |
                            送信日時: {new Date(record.createdAt).toLocaleString('ja-JP')} |
                            送信先: {(() => {
                              if (record.isBroadcast) {
                                const roleName = record.targetRole ? roleLabels[record.targetRole] : '全ユーザー';
                                return `${roleName} (${record.notificationsSent}名に送信)`;
                              } else if (record.targetUserEmails && record.targetUserEmails.length > 0) {
                                if (record.targetUserEmails.length === 1) {
                                  return record.targetUserEmails[0];
                                } else if (record.targetUserEmails.length <= 3) {
                                  return record.targetUserEmails.join(', ');
                                } else {
                                  return `${record.targetUserEmails[0]} 他${record.targetUserEmails.length - 1}名`;
                                }
                              } else {
                                const count = record.targetUserIds?.length || 0;
                                return `${count}名`;
                              }
                            })()}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {record.notificationsFailed > 0 && (
                            <div className="text-sm">
                              <span className="text-red-600 font-medium">⚠️ {record.notificationsFailed}件失敗</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-2 pt-0">
                      <div className="space-y-1">
                        <div>
                          <p className="text-sm font-medium mb-0.5">メッセージ</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.message}</p>
                        </div>
                        {record.errorMessage && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-sm font-medium text-red-900 mb-0.5">エラー</p>
                            <p className="text-sm text-red-800">{record.errorMessage}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Preview Dialog */}
        <Dialog open={!!previewAnnouncement} onOpenChange={() => setPreviewAnnouncement(null)}>
          <DialogContent className="w-full max-w-3xl p-2 rounded-md">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base">プレビュー</DialogTitle>
            </DialogHeader>
            {previewAnnouncement && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {getImportanceBadgeVariant(previewAnnouncement.importance) && (
                    <Badge variant={getImportanceBadgeVariant(previewAnnouncement.importance)} className="py-0.5 px-2 text-sm rounded-md">
                      {importanceLabels[previewAnnouncement.importance]}
                    </Badge>
                  )}
                  <Badge variant="outline" className="py-0.5 px-2 text-sm rounded-md">
                    {categoryLabels[previewAnnouncement.category]}
                  </Badge>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-2">{previewAnnouncement.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {new Date(previewAnnouncement.created_at).toLocaleString('ja-JP')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{previewAnnouncement.content}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-2 rounded-md">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base">お知らせを編集</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <div>
                <Label htmlFor="edit-title" className="mb-1 block text-sm font-medium">タイトル</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="text-sm h-8 rounded-md"
                />
              </div>
              <div>
                <Label htmlFor="edit-content" className="mb-1 block text-sm font-medium">内容</Label>
                <Textarea
                  id="edit-content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  className="text-sm py-2 min-h-[150px] rounded-md resize-none"
                />
              </div>
              <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
                <div>
                  <Label htmlFor="edit-category" className="mb-1 block text-sm font-medium">カテゴリ</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: 'maintenance' | 'feature' | 'warning' | 'info' | 'event') => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className="text-sm h-8 rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-md">
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key} className="text-sm py-2">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-importance" className="mb-1 block text-sm font-medium">重要度</Label>
                  <Select
                    value={formData.importance}
                    onValueChange={(value: 'low' | 'medium' | 'high') => setFormData({ ...formData, importance: value })}
                  >
                    <SelectTrigger className="text-sm h-8 rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-md">
                      {Object.entries(importanceLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key} className="text-sm py-2">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-target_role" className="mb-1 block text-sm font-medium">対象ユーザー</Label>
                  <Select
                    value={formData.target_user_role}
                    onValueChange={(value: 'all' | 'admin' | 'user' | 'kyc_verified' | 'kyc_pending') => setFormData({ ...formData, target_user_role: value })}
                  >
                    <SelectTrigger className="text-sm h-8 rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-md">
                      {Object.entries(roleLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key} className="text-sm py-2">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                <div>
                  <Label htmlFor="edit-publish_at" className="mb-1 block text-sm font-medium">公開日時</Label>
                  <Input
                    id="edit-publish_at"
                    type="datetime-local"
                    value={formData.publish_at || ''}
                    onChange={(e) => setFormData({ ...formData, publish_at: e.target.value || null })}
                    className="text-sm h-8 rounded-md"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-expire_at" className="mb-1 block text-sm font-medium">終了日時</Label>
                  <Input
                    id="edit-expire_at"
                    type="datetime-local"
                    value={formData.expire_at || ''}
                    onChange={(e) => setFormData({ ...formData, expire_at: e.target.value || null })}
                    className="text-sm h-8 rounded-md"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-published"
                  checked={formData.published}
                  onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="edit-published" className="cursor-pointer text-sm">
                  公開する
                </Label>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedAnnouncement(null);
                  resetForm();
                }}
                className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending}
                className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                更新
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Create/Edit Dialog */}
        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
          <DialogContent className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 rounded-lg">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-base">
                {editingTemplate ? 'テンプレートを編集' : '新規テンプレートを作成'}
              </DialogTitle>
              <DialogDescription className="text-sm">
                通知テンプレートを{editingTemplate ? '編集' : '作成'}します。変数は {`{{変数名}}`} の形式で使用できます。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="template-key" className="mb-2 block text-sm font-medium">テンプレートキー *</Label>
                <Input
                  id="template-key"
                  placeholder="例: custom_notification"
                  value={templateFormData.template_key}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, template_key: e.target.value })}
                  disabled={!!editingTemplate}
                  className="text-sm h-8 rounded-md"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  英数字とアンダースコアのみ使用可能。作成後は変更できません。
                </p>
              </div>

              <div>
                <Label htmlFor="template-name" className="mb-2 block text-sm font-medium">テンプレート名 *</Label>
                <Input
                  id="template-name"
                  placeholder="例: カスタム通知"
                  value={templateFormData.name}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                  className="text-sm h-8 rounded-md"
                />
              </div>

              <div>
                <Label htmlFor="template-description" className="mb-2 block text-sm font-medium">説明</Label>
                <Input
                  id="template-description"
                  placeholder="このテンプレートの用途を説明"
                  value={templateFormData.description}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
                  className="text-sm h-8 rounded-md"
                />
              </div>

              <div>
                <Label htmlFor="template-title" className="mb-2 block text-sm font-medium">タイトルテンプレート *</Label>
                <Input
                  id="template-title"
                  placeholder={`例: {{user_name}}さんへのお知らせ`}
                  value={templateFormData.title_template}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, title_template: e.target.value })}
                  className="text-sm h-8 rounded-md"
                />
              </div>

              <div>
                <Label htmlFor="template-message" className="mb-2 block text-sm font-medium">メッセージテンプレート *</Label>
                <Textarea
                  id="template-message"
                  placeholder={`例: {{user_name}}さん、{{action}}が完了しました。`}
                  value={templateFormData.message_template}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, message_template: e.target.value })}
                  rows={4}
                  className="text-sm py-2 min-h-[100px] rounded-md resize-none"
                />
              </div>

              <div>
                <Label htmlFor="template-type" className="mb-2 block text-sm font-medium">通知タイプ</Label>
                <Select
                  value={templateFormData.notification_type}
                  onValueChange={(value) => setTemplateFormData({ ...templateFormData, notification_type: value })}
                >
                  <SelectTrigger className="text-sm h-8 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-md">
                    <SelectItem value="info" className="text-sm py-2">情報</SelectItem>
                    <SelectItem value="success" className="text-sm py-2">成功</SelectItem>
                    <SelectItem value="warning" className="text-sm py-2">警告</SelectItem>
                    <SelectItem value="error" className="text-sm py-2">エラー</SelectItem>
                    <SelectItem value="kyc" className="text-sm py-2">KYC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">変数</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddVariable}
                    className="h-8 text-sm px-3 rounded-md"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    変数を追加
                  </Button>
                </div>
                <div className="space-y-2">
                  {templateFormData.variables.map((variable, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="変数名（例: user_name）"
                        value={variable}
                        onChange={(e) => handleVariableChange(index, e.target.value)}
                        className="text-sm h-8 rounded-md flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => handleRemoveVariable(index)}
                        className="h-8 w-9 rounded-md"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {templateFormData.variables.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      変数が定義されていません。必要に応じて追加してください。
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="template-active"
                  checked={templateFormData.active}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, active: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="template-active" className="cursor-pointer text-sm">
                  アクティブ
                </Label>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsTemplateDialogOpen(false);
                  setEditingTemplate(null);
                  resetTemplateForm();
                }}
                className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleSubmitTemplate}
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                className="h-8 text-sm px-4 rounded-md flex-1 md:flex-none"
              >
                {(createTemplateMutation.isPending || updateTemplateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingTemplate ? '更新' : '作成'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}