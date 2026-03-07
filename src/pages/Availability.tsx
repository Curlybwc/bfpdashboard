import AvailabilityForm from '@/components/AvailabilityForm';
import PageHeader from '@/components/PageHeader';

const Availability = () => {
  return (
    <div className="pb-20">
      <PageHeader title="Availability" backTo="/today" />
      <div className="p-4">
        <AvailabilityForm />
      </div>
    </div>
  );
};

export default Availability;
