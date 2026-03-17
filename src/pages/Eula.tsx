const Eula = () => (
  <div className="min-h-screen bg-background text-foreground p-6 md:p-12 max-w-3xl mx-auto">
    <h1 className="text-3xl font-bold mb-6">End User License Agreement (EULA)</h1>
    <p className="text-sm text-muted-foreground mb-8">Last updated: March 17, 2026</p>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">1. Agreement to Terms</h2>
      <p>By accessing or using the BFP Dashboard application ("Service"), you agree to be bound by this End User License Agreement ("Agreement"). If you do not agree, do not use the Service.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">2. License Grant</h2>
      <p>We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your internal business operations, subject to the terms of this Agreement.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">3. Restrictions</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>You may not copy, modify, distribute, or reverse-engineer any part of the Service</li>
        <li>You may not use the Service for any unlawful purpose</li>
        <li>You may not share your account credentials with unauthorized parties</li>
        <li>You may not attempt to gain unauthorized access to any part of the Service</li>
      </ul>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">4. User Data & Content</h2>
      <p>You retain ownership of data you enter into the Service. By using the Service, you grant us a limited license to process and store your data as necessary to provide the Service. Our use of your data is also governed by our Privacy Policy.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">5. Service Availability</h2>
      <p>We strive to maintain the Service's availability but do not guarantee uninterrupted access. We may modify, suspend, or discontinue the Service at any time with reasonable notice.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">6. Disclaimer of Warranties</h2>
      <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">7. Limitation of Liability</h2>
      <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">8. Termination</h2>
      <p>We may terminate or suspend your access to the Service at any time for violation of this Agreement. Upon termination, your right to use the Service ceases immediately.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">9. Changes to This Agreement</h2>
      <p>We may update this Agreement from time to time. Continued use of the Service after changes constitutes acceptance of the revised terms.</p>
    </section>

    <section className="space-y-4 mb-8">
      <h2 className="text-xl font-semibold">10. Governing Law</h2>
      <p>This Agreement shall be governed by the laws of the jurisdiction in which the Service operator is located, without regard to conflict of law principles.</p>
    </section>
  </div>
);

export default Eula;
