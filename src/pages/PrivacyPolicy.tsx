const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background text-foreground p-6 md:p-12 max-w-3xl mx-auto">
    <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
    <p className="text-sm text-muted-foreground mb-8">Last updated: March 17, 2026</p>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">1. Information We Collect</h2>
      <p>We collect information you provide directly, including your name, email address, and any data you enter while using the BFP Dashboard application ("Service"). We also automatically collect usage data such as pages visited, features used, and device information.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>To provide, maintain, and improve the Service</li>
        <li>To manage your account and authenticate your identity</li>
        <li>To track project tasks, materials, shifts, and related operational data</li>
        <li>To communicate with you about the Service</li>
        <li>To comply with legal obligations</li>
      </ul>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">3. Data Storage & Security</h2>
      <p>Your data is stored securely using industry-standard cloud infrastructure. We use encryption in transit and at rest, role-based access controls, and regular security reviews to protect your information.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">4. Data Sharing</h2>
      <p>We do not sell your personal information. We may share data with third-party service providers (e.g., cloud hosting, payment processing, accounting integrations) solely to operate the Service. We may also disclose information if required by law.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">5. Third-Party Integrations</h2>
      <p>The Service may integrate with third-party platforms such as QuickBooks and Stripe. When you connect these services, data may be shared with those platforms in accordance with their own privacy policies.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">6. Your Rights</h2>
      <p>You may request access to, correction of, or deletion of your personal data by contacting us. You may also request a copy of your data in a portable format.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">7. Data Retention</h2>
      <p>We retain your data for as long as your account is active or as needed to provide the Service. We may retain certain data as required by law or for legitimate business purposes.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy within the Service.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">9. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us through the application.</p>
    </section>
  </div>
);

export default PrivacyPolicy;
