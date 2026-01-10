import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation('support');
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

        return {
          ...reply,
          is_admin: isAdmin
        };
      });

      setReplies(repliesWithAdminFlag);
    } catch (error) {
      console.error('Reply load error:', error);
      toast({
        title: t('toast.error'),
        description: t('toast.loadRepliesFailed'),
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
        title: t('toast.success'),
        description: t('toast.replySent')
      });
    } catch (error) {
      console.error('Reply send error:', error);
      toast({
        title: t('toast.error'),
        description: t('toast.sendReplyFailed'),
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
          <h1 className="text-2xl md:text-2xl font-bold text-gray-900">{t('pageTitle')}</h1>
          <Button onClick={() => setOpen(true)} className="transition-all duration-200 active:scale-95">
            {t('createTicket')}
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
                    <th className="text-left p-4 font-medium text-sm">{t('table.ticketId')}</th>
                    <th className="text-left p-4 font-medium text-sm">{t('table.subject')}</th>
                    <th className="text-left p-4 font-medium text-sm">{t('table.status')}</th>
                    <th className="text-left p-4 font-medium text-sm">{t('table.createdAt')}</th>
                    <th className="text-left p-4 font-medium text-sm">{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t('noRecords')}</td></tr>
                  ) : tickets.map(ticket => (
                    <tr key={ticket.id} className="border-b hover:bg-muted/40">
                      <td className="p-4 font-mono text-xs">{ticket.id.slice(0, 8)}…</td>
                      <td className="p-4 text-sm">{ticket.subject}</td>
                      <td className="p-4 text-sm">
                        <Badge variant={
                          ticket.status === 'open' ? 'default' :
                            ticket.status === 'pending' ? 'secondary' : 'outline'
                        }>
                          {t(`status.${ticket.status}`)}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm">{new Date(ticket.created_at).toLocaleString()}</td>
                      <td className="p-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedTicket(ticket);
                            loadReplies(ticket.id);
                          }}
                          className="transition-all duration-200 active:scale-95"
                        >
                          <MessageCircle className="h-4 w-4 mr-1" />
                          {t('details')}
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
                  <p className="text-muted-foreground">{t('noRecords')}</p>
                </div>
              ) : tickets.map(ticket => (
                <Card key={ticket.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-primary" />
                        <span className="font-mono text-xs">{ticket.id.slice(0, 8)}…</span>
                      </div>
                      <Badge variant={
                        ticket.status === 'open' ? 'default' :
                          ticket.status === 'pending' ? 'secondary' : 'outline'
                      }>
                        {t(`status.${ticket.status}`)}
                      </Badge>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="font-semibold text-sm line-clamp-2">{ticket.subject}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(ticket.created_at).toLocaleString('ja-JP', {
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
                        setSelectedTicket(ticket);
                        loadReplies(ticket.id);
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      {t('showDetails')}
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
              <CardTitle>{t('newTicket.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 md:p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('newTicket.subjectLabel')}</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('newTicket.subjectPlaceholder')}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('newTicket.bodyLabel')}</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('newTicket.bodyPlaceholder')}
                  rows={4}
                  className="w-full"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={async () => {
                    if (!user?.id) return;
                    if (!subject.trim()) { toast({ title: t('toast.subjectRequired'), variant: 'destructive' }); return; }
                    const { error } = await supabase.from('support_tickets').insert({ user_id: user.id, subject, body });
                    if (error) { toast({ title: t('toast.createFailed'), description: error.message, variant: 'destructive' }); } else { toast({ title: t('toast.created') }); setSubject(''); setBody(''); setOpen(false); load(); }
                  }}
                  className="flex-1 sm:flex-none transition-all duration-200 active:scale-95"
                >
                  {t('newTicket.submit')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="flex-1 sm:flex-none transition-all duration-200 active:scale-95"
                >
                  {t('newTicket.cancel')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ticket Detail Dialog */}
        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                {t('ticketDetail.title', { subject: selectedTicket?.subject })}
              </DialogTitle>
            </DialogHeader>

            {selectedTicket && (
              <div className="space-y-4">
                {/* Ticket Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          selectedTicket.status === 'open' ? 'default' :
                            selectedTicket.status === 'pending' ? 'secondary' : 'outline'
                        }>
                          {t(`status.${selectedTicket.status}`)}
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

                {/* Reply List */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('ticketDetail.replyHistory')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loadingReplies ? (
                      <div className="text-center py-4">
                        <Clock className="h-5 w-5 animate-spin mx-auto mb-2" />
                        <p className="text-muted-foreground">{t('ticketDetail.loadingReplies')}</p>
                      </div>
                    ) : replies.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('ticketDetail.noReplies')}
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
                                  <span>{t('ticketDetail.supportStaff')}</span>
                                </>
                              ) : reply.user_id === user?.id ? (
                                <>
                                  <User className="h-3 w-3" />
                                  <span>{t('ticketDetail.you')}</span>
                                </>
                              ) : (
                                <>
                                  <User className="h-3 w-3" />
                                  <span>{t('ticketDetail.user')}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>{new Date(reply.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Reply Input Form */}
                    <div className="border-t pt-4 mt-6">
                      <div className="space-y-3">
                        <label className="text-sm font-medium">{t('ticketDetail.addReply')}</label>
                        <Textarea
                          value={newReply}
                          onChange={(e) => setNewReply(e.target.value)}
                          placeholder={t('ticketDetail.replyPlaceholder')}
                          rows={3}
                        />
                        <div className="flex justify-end">
                          <Button
                            onClick={sendReply}
                            disabled={!newReply.trim()}
                          >
                            {t('ticketDetail.sendReply')}
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
