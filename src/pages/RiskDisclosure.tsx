import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AlertTriangle, TrendingDown, Shield } from "lucide-react";

const RiskDisclosure = () => {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center mb-4">
                <AlertTriangle className="h-12 w-12 text-gray-600" />
              </div>
              <h1 className="text-base md:text-base font-bold text-gray-900">リスク開示</h1>
              <p className="text-gray-600">暗号資産取引に関するリスクについて</p>
            </div>

            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded-r-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-gray-600 mr-2" />
                <p className="font-semibold text-gray-800">重要な警告</p>
              </div>
              <p className="text-gray-700 mt-2">
                暗号資産取引は高いリスクを伴います。投資前に必ずリスクを理解し、失っても問題のない資金での取引をお勧めします。
              </p>
            </div>

            <div className="space-y-8 text-gray-700">
              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
                  <TrendingDown className="h-5 w-5 mr-2 text-gray-600" />
                  1. 価格変動リスク
                </h2>
                <p className="leading-relaxed">
                  暗号資産の価格は極めて不安定で、短期間で大幅に変動する可能性があります。
                </p>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-2">具体的なリスク</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    <li>1日で50%以上の価格変動が発生する可能性</li>
                    <li>投資元本を大幅に下回る可能性</li>
                    <li>市場の流動性不足による価格の急変動</li>
                    <li>外部要因（規制、ニュース等）による突然の価格変動</li>
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">2. 流動性リスク</h2>
                <p className="leading-relaxed">
                  市場の状況により、希望する価格や時間での売買ができない場合があります。
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>取引量が少ない暗号資産での売買困難</li>
                  <li>市場の混乱時における取引停止</li>
                  <li>注文が約定しない、または予想より不利な価格での約定</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">3. 技術的リスク</h2>
                <p className="leading-relaxed">
                  暗号資産は新しい技術に基づくため、技術的な問題が発生する可能性があります。
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-800 mb-2">プラットフォームリスク</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                      <li>システム障害による取引停止</li>
                      <li>サーバーダウンによるアクセス不能</li>
                      <li>メンテナンス中の機能制限</li>
                    </ul>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-800 mb-2">ブロックチェーンリスク</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                      <li>ネットワーク分岐（フォーク）</li>
                      <li>送金の遅延や失敗</li>
                      <li>スマートコントラクトの不具合</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-gray-600" />
                  4. セキュリティリスク
                </h2>
                <p className="leading-relaxed">
                  デジタル資産の性質上、セキュリティリスクが存在します。
                </p>
                <div className="space-y-3">
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                    <h4 className="font-medium text-gray-800">ハッキング・盗難リスク</h4>
                    <p className="text-gray-700 text-sm">取引所や個人ウォレットへの不正アクセスによる資産の盗難</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                    <h4 className="font-medium text-gray-800">フィッシング詐欺</h4>
                    <p className="text-gray-700 text-sm">偽のウェブサイトやメールによる認証情報の窃取</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                    <h4 className="font-medium text-gray-800">プライベートキー紛失</h4>
                    <p className="text-gray-700 text-sm">秘密鍵の紛失による資産への永続的なアクセス不能</p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">5. 規制リスク</h2>
                <p className="leading-relaxed">
                  各国政府による暗号資産規制の変更が取引に影響を与える可能性があります。
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>法的地位の変更や取引の制限・禁止</li>
                  <li>税制変更による課税負担の増加</li>
                  <li>取引所の営業許可取消や業務停止</li>
                  <li>国際送金規制の強化</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">6. 運用会社リスク</h2>
                <p className="leading-relaxed">
                  取引所運営会社に関するリスクも存在します。
                </p>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <ul className="list-disc list-inside space-y-2">
                    <li>運営会社の倒産や業務停止</li>
                    <li>管理体制の不備による顧客資産の消失</li>
                    <li>内部不正による資産の流用</li>
                    <li>規制当局による業務改善命令</li>
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">7. リスク軽減のための推奨事項</h2>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-3">安全な取引のために</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                      <li>余剰資金での投資</li>
                      <li>分散投資の実施</li>
                      <li>定期的な情報収集</li>
                      <li>感情的な取引の回避</li>
                    </ul>
                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                      <li>強固なパスワード設定</li>
                      <li>二段階認証の活用</li>
                      <li>定期的なセキュリティ確認</li>
                      <li>公式サイトからのアクセス</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">8. 免責事項</h2>
                <div className="bg-gray-100 p-4 rounded-lg border-2 border-gray-300">
                  <p className="leading-relaxed font-medium text-gray-800">
                    本リスク開示書は、暗号資産取引に関する主要なリスクについて説明したものですが、
                    すべてのリスクを網羅するものではありません。投資判断は、お客様ご自身の責任で行ってください。
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">9. お問い合わせ</h2>
                <p className="leading-relaxed">
                  リスクに関するご質問やご不明な点は、お気軽にお問い合わせください。
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default RiskDisclosure;