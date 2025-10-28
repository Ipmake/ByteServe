import Typography, { TypographyProps } from "@mui/material/Typography";
import moment from "moment";

function AbsoluteDateDisplay({
  date,
  props = {
    variant: "body2",
    sx: { width: "fit-content", cursor: "default"}
  }
}: {
  date: string | Date;
  props?: TypographyProps;
}) {
  return (
      <Typography {...props}>
        {moment(date).format("LLL")}
      </Typography>
  );
}

export default AbsoluteDateDisplay;
