import { Button, Card } from "heroui-native";
import { Text } from "react-native";

export function ConnectionBanner(props: {
  readonly title: string;
  readonly detail: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}) {
  return (
    <Card variant="secondary" className="mx-4 mt-3">
      <Card.Body className="gap-1">
        <Text className="text-base font-semibold text-foreground">{props.title}</Text>
        <Text className="text-sm leading-5 text-muted">{props.detail}</Text>
      </Card.Body>
      {props.actionLabel && props.onAction ? (
        <Card.Footer>
          <Button size="sm" variant="secondary" onPress={props.onAction}>
            {props.actionLabel}
          </Button>
        </Card.Footer>
      ) : null}
    </Card>
  );
}
