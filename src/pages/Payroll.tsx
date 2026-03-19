import PageHeader from '@/components/PageHeader';
import PayrollSummary from '@/components/shifts/PayrollSummary';

const Payroll = () => {
  return (
    <div className="pb-20">
      <PageHeader title="Payroll" backTo="/admin" />
      <div className="p-4">
        <PayrollSummary
          billFirstMode
          onEditShift={(shift) => {
            // Navigate to shift edit via the shifts page
            window.location.href = `/shifts?edit=${shift.id}`;
          }}
        />
      </div>
    </div>
  );
};

export default Payroll;
