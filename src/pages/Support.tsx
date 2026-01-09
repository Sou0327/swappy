import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Clock, User, UserCog } from "lucide-react";

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  status: 'open' | 'pending' | 'closed';
  priority?: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
}

interface SupportReply {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  created_at: string;
  is_admin?: boolean;
}

const Support = () => {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // チケット詳細ダイアログ
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<SupportReply[]>([]);
  const [newReply, setNewReply] = useState("");
  const [loadingReplies, setLoadingReplies] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { setTickets([]); return; }
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setTickets((data || []) as SupportTicket[]);
  }, [user?.id]);

  // 返信を取得する関数
  const loadReplies = useCallback(async (ticketId: string) => {
    setLoadingReplies(true);
    try {
      const { data, error } = await supabase
        .from('support_replies')
        .select(`
          id,
          ticket_id,
          user_id,
          message,
          created_at
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // 管理者かどうかを判定 - 現在のユーザー以外の返信は管理者と見なす（簡略化）
      const repliesWithAdminFlag = (data || []).map((reply) => {
        // 現在のユーザーの返信かチェック
        const isCurrentUser = reply.user_id === user?.id;
        // 現在のユーザーでない場合は管理者からの返信と判定
        const isAdmin = !isCurrentUser;

        console.log(`ユーザー ${reply.user_id} の管理者判定:`, {
          isCurrentUser,
          isAdmin,
          currentUserId: user?.id,
          currentUserRole: userRole
        });

        return {
          ...reply,
          is_admin: isAdmin
        };
      });

      setReplies(repliesWithAdminFlag);
    } catch (error) {
      console.error('返信の取得エラー:', error);
      toast({
        title: "エラー",
        description: "返信の取得に失敗しました",
        variant: "destructive"
      });
    } finally {
      setLoadingReplies(false);
    }
  }, [toast, user?.id, userRole]);

  // 返信を送信する関数
  const sendReply = async () => {
    if (!selectedTicket || !newReply.trim() || !user?.id) return;

    try {
      const { error } = await supabase
        .from('support_replies')
        .insert({
          ticket_id: selectedTicket.id,
          user_id: user.id,
          message: newReply.trim()
        });

      if (error) throw error;

      setNewReply("");
      await loadReplies(selectedTicket.id);
      toast({
        title: "成功",
        description: "返信を送信しました"
      });
    } catch (error) {
      console.error('返信送信エラー:', error);
      toast({
        title: "エラー",
        description: "返信の送信に失敗しました",
        variant: "destructive"
      });
    }
  };

  useEffect(() => { load(); }, [user?.id, load]);
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
          <h1 className="text-2xl md:text-2xl font-bold text-gray-900">サポート</h1>
          <Button onClick={() => setOpen(true)} className="transition-all duration-200 active:scale-95">
            チケット作成
          </Button>
        </div>

        {/* Support Tickets */}
        <Card>
          <CardContent className="p-0">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-sm">チケットID</th>
                    <th className="text-left p-4 font-medium text-sm">件名</th>
                    <th className="text-left p-4 font-medium text-sm">ステータス</th>
                    <th className="text-left p-4 font-medium text-sm">作成日</th>
                    <th className="text-left p-4 font-medium text-sm">アクション</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">記録が見つかりません</td></tr>
                  ) : tickets.map(t => (
                    <tr key={t.id} className="border-b hover:bg-muted/40">
                      <td className="p-4 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                      <td className="p-4 text-sm">{t.subject}</td>
                      <td className="p-4 text-sm">
                        <Badge variant={
                          t.status === 'open' ? 'default' :
                            t.status === 'pending' ? 'secondary' : 'outline'
                        }>
                          {t.status === 'open' ? '未対応' :
                            t.status === 'pending' ? '対応中' : 'クローズ'}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="p-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedTicket(t);
                            loadReplies(t.id);
                          }}
                          className="transition-all duration-200 active:scale-95"
                        >
                          <MessageCircle className="h-4 w-4 mr-1" />
                          詳細
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3 p-3">
              {tickets.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🔍</div>
                  <p className="text-muted-foreground">記録が見つかりません</p>
                </div>
              ) : tickets.map(t => (
                <Card key={t.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-primary" />
                        <span className="font-mono text-xs">{t.id.slice(0, 8)}…</span>
                      </div>
                      <Badge variant={
                        t.status === 'open' ? 'default' :
                          t.status === 'pending' ? 'secondary' : 'outline'
                      }>
                        {t.status === 'open' ? '未対応' :
                          t.status === 'pending' ? '対応中' : 'クローズ'}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      <div className="font-semibold text-sm line-clamp-2">{t.subject}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString('ja-JP', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full transition-all duration-200 active:scale-95"
                      onClick={() => {
                        setSelectedTicket(t);
                        loadReplies(t.id);
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      詳細を表示
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {open && (
          <Card>
            <CardHeader>
              <CardTitle>新規チケット</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 md:p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">件名</label>
                <Input 
                  value={subject} 
                  onChange={(e) => setSubject(e.target.value)} 
                  placeholder="件名を入力" 
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">本文</label>
                <Textarea 
                  value={body} 
                  onChange={(e) => setBody(e.target.value)} 
                  placeholder="問題の詳細を入力" 
                  rows={4}
                  className="w-full"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  onClick={async () => {
                    if (!user?.id) return;
                    if (!subject.trim()) { toast({ title: '件名が必要です', variant: 'destructive' }); return; }
                    const { error } = await supabase.from('support_tickets').insert({ user_id: user.id, subject, body });
                    if (error) { toast({ title: '作成失敗', description: error.message, variant: 'destructive' }); } else { toast({ title: '作成しました' }); setSubject(''); setBody(''); setOpen(false); load(); }
                  }}
                  className="flex-1 sm:flex-none transition-all duration-200 active:scale-95"
                >
                  送信
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setOpen(false)}
                  className="flex-1 sm:flex-none transition-all duration-200 active:scale-95"
                >
                  キャンセル
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* チケット詳細ダイアログ */}
        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                チケット詳細: {selectedTicket?.subject}
              </DialogTitle>
            </DialogHeader>

            {selectedTicket && (
              <div className="space-y-4">
                {/* チケット情報 */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          selectedTicket.status === 'open' ? 'default' :
                            selectedTicket.status === 'pending' ? 'secondary' : 'outline'
                        }>
                          {selectedTicket.status === 'open' ? '未対応' :
                            selectedTicket.status === 'pending' ? '対応中' : 'クローズ'}
                        </Badge>
                        {selectedTicket.priority && <Badge variant="outline">{selectedTicket.priority}</Badge>}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(selectedTicket.created_at).toLocaleString()}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/50 p-4 rounded-lg">
                      <p className="whitespace-pre-wrap">{selectedTicket.body}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* 返信リスト */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">返信履歴</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loadingReplies ? (
                      <div className="text-center py-4">
                        <Clock className="h-5 w-5 animate-spin mx-auto mb-2" />
                        <p className="text-muted-foreground">返信を読み込み中...</p>
                      </div>
                    ) : replies.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        まだ返信がありません
                      </div>
                    ) : (
                      replies.map((reply) => (
                        <div
                          key={reply.id}
                          className={`flex gap-3 ${reply.is_admin || reply.user_id !== user?.id ? 'flex-row-reverse' : ''
                            }`}
                        >
                          <div className="flex-shrink-0">
                            {reply.is_admin ? (
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <UserCog className="h-4 w-4 text-blue-600" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                <User className="h-4 w-4 text-gray-600" />
                              </div>
                            )}
                          </div>
                          <div className={`flex-1 max-w-[70%] ${reply.is_admin || reply.user_id !== user?.id ? 'text-right' : ''
                            }`}>
                            <div className={`p-3 rounded-lg ${reply.is_admin || reply.user_id !== user?.id
                                ? 'bg-blue-100 text-blue-900'
                                : 'bg-gray-100 text-gray-900'
                              }`}>
                              <p className="whitespace-pre-wrap">{reply.message}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              {reply.is_admin ? (
                                <>
                                  <UserCog className="h-3 w-3" />
                                  <span>サポート担当</span>
                                </>
                              ) : reply.user_id === user?.id ? (
                                <>
                                  <User className="h-3 w-3" />
                                  <span>あなた</span>
                                </>
                              ) : (
                                <>
                                  <User className="h-3 w-3" />
                                  <span>ユーザー</span>
                                </>
                              )}
                              <span>•</span>
                              <span>{new Date(reply.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}

                    {/* 返信入力フォーム */}
                    <div className="border-t pt-4 mt-6">
                      <div className="space-y-3">
                        <label className="text-sm font-medium">返信を追加</label>
                        <Textarea
                          value={newReply}
                          onChange={(e) => setNewReply(e.target.value)}
                          placeholder="返信内容を入力してください..."
                          rows={3}
                        />
                        <div className="flex justify-end">
                          <Button
                            onClick={sendReply}
                            disabled={!newReply.trim()}
                          >
                            返信を送信
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Support;
